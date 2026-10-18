<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ClientRequest;
use App\Http\Resources\ClientResource;
use App\Http\Resources\TimelineEntryResource;
use App\Models\CallLog;
use App\Models\Client;
use App\Models\Task;
use App\Models\User;
use App\Models\VoiceNote;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ClientController extends Controller
{
    public const TIMELINE_PAGE = 20;

    /**
     * Clients are shared across the organization, but what the list says about contact (last contact, needs
     * follow-up) comes only from the call logs the viewer may read (CallLog::visibleTo()). A client needs a
     * follow-up when the follow-up date set on its latest call has passed and no call has been logged since.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'sort' => ['nullable', Rule::in(['name', 'last_contact'])],
            'needs_follow_up' => ['nullable', 'boolean'],
            'today' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $user = $request->user();
        $search = trim((string) $request->query('search', ''));
        $lastContact = $this->latestLog($user, 'created_at');

        $clients = $user->organization->clients()
            ->select('clients.*')
            ->addSelect(['last_contact_at' => $lastContact])
            ->withCasts(['last_contact_at' => 'datetime'])
            ->when($search !== '', function ($query) use ($search) {
                $like = '%'.addcslashes($search, '\%_').'%';
                $query->where(fn ($q) => $q->where('name', 'like', $like)->orWhere('company', 'like', $like));
            })
            ->when($request->boolean('needs_follow_up'), fn ($query) => $query
                ->where($this->latestLog($user, 'follow_up_at'), '<', $this->today($request->query('today'))))
            ->when($request->query('sort') === 'last_contact', fn ($query) => $query
                ->orderByRaw('('.$lastContact->toSql().') DESC NULLS LAST', $lastContact->getBindings()))
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(50)
            ->withQueryString();

        return ClientResource::collection($clients);
    }

    public function store(ClientRequest $request): JsonResponse
    {
        $client = $request->user()->organization->clients()->create($request->validated());

        return (new ClientResource($client))->response()->setStatusCode(201);
    }

    /** The client, plus contact stats drawn from the call logs and tasks the viewer may see. */
    public function show(Request $request, Client $client): ClientResource
    {
        Gate::authorize('view', $client);
        $request->validate(['today' => ['nullable', 'date_format:Y-m-d']]);
        $user = $request->user();
        $today = $this->today($request->query('today'));

        $logs = CallLog::visibleTo($user)->where('call_logs.client_id', $client->id);
        $latest = (clone $logs)->latest('call_logs.created_at')->latest('call_logs.id')
            ->first(['call_logs.created_at', 'call_logs.sentiment', 'call_logs.follow_up_at']);
        $next = (clone $logs)->where('follow_up_at', '>=', $today)->orderBy('follow_up_at')->orderBy('call_logs.id')
            ->first(['follow_up_at', 'follow_up_phrase']);
        $openTasks = Task::where('org_id', $client->org_id)->where('client_id', $client->id)->whereNull('done_at')
            ->when(! $user->isManager(), fn (Builder $q) => $q->where('assignee_id', $user->id))->count();

        return (new ClientResource($client))->additional(['stats' => [
            'today' => $today,
            'last_contact_at' => $latest?->created_at?->toIso8601String(),
            'latest_sentiment' => $latest?->sentiment->value,
            'open_tasks' => $openTasks,
            'next_follow_up' => $next ? ['date' => $next->follow_up_at, 'phrase' => $next->follow_up_phrase] : null,
            'needs_follow_up' => $latest?->follow_up_at !== null && $latest->follow_up_at < $today,
        ]]);
    }

    /**
     * The client's call history, newest first, cursor-paginated (FR UI 3.1). A rep sees only the logs they may read
     * (their own calls); a manager sees the organization's. Each entry carries its tasks (a rep's own only) and a
     * link to the source note when the viewer may open it.
     */
    public function timeline(Request $request, Client $client): AnonymousResourceCollection
    {
        Gate::authorize('view', $client);
        $user = $request->user();

        $logs = CallLog::visibleTo($user)
            ->where('call_logs.client_id', $client->id)
            ->select('call_logs.*')
            ->addSelect(['note_owner_id' => VoiceNote::select('user_id')->whereColumn('voice_notes.id', 'call_logs.voice_note_id')])
            ->with([
                'user:id,name',
                'tasks' => fn ($q) => $q->when(! $user->isManager(), fn ($q) => $q->where('assignee_id', $user->id)),
                'tasks.assignee:id,name',
            ])
            ->orderByDesc('call_logs.created_at')
            ->orderByDesc('call_logs.id')
            ->cursorPaginate(self::TIMELINE_PAGE);

        return TimelineEntryResource::collection($logs);
    }

    public function update(ClientRequest $request, Client $client): ClientResource
    {
        // PUT replaces the record, so optional fields left out are cleared.
        $client->update(array_merge(['company' => null, 'email' => null, 'phone' => null, 'notes' => null], $request->validated()));

        return new ClientResource($client);
    }

    public function destroy(Client $client): JsonResponse
    {
        Gate::authorize('delete', $client);
        // Saved call logs are the organization's call history, so a client that has them is kept.
        if (CallLog::where('client_id', $client->id)->exists()) {
            return response()->json(['message' => "This client has saved call logs, so it can't be deleted."], 409);
        }
        $client->delete();

        return response()->json(null, 204);
    }

    /** One column of the newest call log the user may read for each client row, as a correlated subquery. */
    private function latestLog(User $user, string $column): Builder
    {
        return CallLog::visibleTo($user)
            ->select("call_logs.{$column}")
            ->whereColumn('call_logs.client_id', 'clients.id')
            ->orderByDesc('call_logs.created_at')
            ->orderByDesc('call_logs.id')
            ->limit(1);
    }
}
