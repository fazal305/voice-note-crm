<?php

namespace App\Http\Controllers\Api;

use App\Enums\Sentiment;
use App\Enums\VoiceNoteStatus;
use App\Http\Controllers\Controller;
use App\Models\CallLog;
use App\Models\Client;
use App\Models\User;
use App\Models\VoiceNote;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The manager's view of the organization over the last 7, 30 or 90 days. Aggregates and names only (no emails,
 * summaries or transcripts), each from one grouped query, so its cost doesn't grow with the number of rows.
 */
class DashboardController extends Controller
{
    public const RANGES = [7, 30, 90];

    private const NEEDS_ATTENTION_LIMIT = 10;

    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'range' => ['nullable', 'integer', Rule::in(self::RANGES)],
            'today' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $orgId = $request->user()->org_id;
        $range = (int) $request->query('range', 30);
        $today = $this->today($request->query('today'));
        // The range ends today and includes it: "last 7 days" is today and the 6 days before.
        $since = CarbonImmutable::parse($today, config('app.timezone'))->subDays($range - 1)->startOfDay();
        $inRange = fn ($query) => $query->where('created_at', '>=', $since);

        $people = User::where('org_id', $orgId)
            ->withCount([
                'voiceNotes as notes' => $inRange,
                'callLogs as logs' => $inRange,
                'assignedTasks as overdue_tasks' => fn ($q) => $q->whereNull('done_at')->where('due_at', '<', $today),
            ])
            ->orderBy('name')->orderBy('id')
            ->get(['id', 'name', 'role', 'deactivated_at'])
            // Deactivated people stay listed only while they still have something to show.
            ->filter(fn (User $u) => $u->isActive() || $u->notes || $u->logs || $u->overdue_tasks)
            ->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'role' => $u->role->value,
                'active' => $u->isActive(),
                'notes' => (int) $u->notes,
                'logs' => (int) $u->logs,
                'overdue_tasks' => (int) $u->overdue_tasks,
            ])->values();

        $sentiment = CallLog::where('org_id', $orgId)->where('created_at', '>=', $since)
            ->selectRaw('sentiment, COUNT(*) AS total')->groupBy('sentiment')->pluck('total', 'sentiment');

        $statuses = VoiceNote::where('org_id', $orgId)->where('created_at', '>=', $since)
            ->selectRaw('status, COUNT(*) AS total')->groupBy('status')->pluck('total', 'status');

        // Clients whose most recent call (anyone's) was frustrated: the current state, whatever the range.
        $latest = fn (string $column) => CallLog::select($column)->whereColumn('call_logs.client_id', 'clients.id')
            ->orderByDesc('created_at')->orderByDesc('id')->limit(1);
        $frustrated = Client::where('org_id', $orgId)
            ->select(['id', 'name'])
            ->addSelect(['last_contact_at' => $latest('created_at')])
            ->withCasts(['last_contact_at' => 'datetime'])
            ->where($latest('sentiment'), Sentiment::Frustrated->value)
            ->orderByDesc('last_contact_at')->orderBy('id')
            ->limit(self::NEEDS_ATTENTION_LIMIT)
            ->get()
            ->map(fn (Client $c) => ['id' => $c->id, 'name' => $c->name, 'last_contact_at' => $c->last_contact_at?->toIso8601String()]);

        $failed = VoiceNote::where('org_id', $orgId)->where('created_at', '>=', $since)
            ->where('status', VoiceNoteStatus::Failed)
            ->with('user:id,name')
            ->latest()->latest('id')
            ->limit(self::NEEDS_ATTENTION_LIMIT)
            ->get(['id', 'user_id', 'created_at'])
            ->map(fn (VoiceNote $n) => ['id' => $n->id, 'owner' => $n->user->name, 'created_at' => $n->created_at->toIso8601String()]);

        return response()->json([
            'range' => $range,
            'since' => $since->toDateString(),
            'today' => $today,
            'totals' => [
                'notes' => (int) $statuses->sum(),
                'logs' => (int) $sentiment->sum(),
                'overdue_tasks' => (int) $people->sum('overdue_tasks'),
                'failed_notes' => (int) ($statuses[VoiceNoteStatus::Failed->value] ?? 0),
            ],
            'people' => $people,
            'sentiment' => collect(Sentiment::cases())->mapWithKeys(fn (Sentiment $s) => [$s->value => (int) ($sentiment[$s->value] ?? 0)]),
            'processing' => collect(VoiceNoteStatus::cases())->mapWithKeys(fn (VoiceNoteStatus $s) => [$s->value => (int) ($statuses[$s->value] ?? 0)]),
            'frustrated_clients' => $frustrated,
            'failed_notes' => $failed,
        ]);
    }
}
