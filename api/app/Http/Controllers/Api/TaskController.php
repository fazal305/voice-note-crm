<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskOwner;
use App\Http\Controllers\Controller;
use App\Http\Requests\CallLogRequest;
use App\Http\Requests\TaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    private const RELATIONS = ['client:id,name', 'assignee:id,name', 'callLog:id,voice_note_id'];

    /**
     * Open tasks (overdue, due today, or upcoming, which includes undated ones) or done ones. A rep sees their own;
     * a manager sees the organization's and can narrow it to one person. "Today" is the browser's calendar day (see
     * Controller::today()).
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $request->validate([
            'status' => ['nullable', Rule::in(['open', 'done'])],
            'due' => ['nullable', Rule::in(['overdue', 'today', 'upcoming'])],
            'assignee_id' => ['nullable', 'integer'],
            'today' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $user = $request->user();
        $today = $this->today($request->query('today'));

        $scope = Task::query()
            ->where('org_id', $user->org_id)
            ->when(! $user->isManager(), fn (Builder $q) => $q->where('assignee_id', $user->id))
            ->when($user->isManager() && $request->filled('assignee_id'), fn (Builder $q) => $q->where('assignee_id', (int) $request->query('assignee_id')));

        $open = (clone $scope)->whereNull('done_at');
        $counts = (clone $open)->selectRaw(
            'SUM(CASE WHEN due_at < ? THEN 1 ELSE 0 END) AS overdue, SUM(CASE WHEN due_at = ? THEN 1 ELSE 0 END) AS today, '
            .'SUM(CASE WHEN due_at > ? OR due_at IS NULL THEN 1 ELSE 0 END) AS upcoming',
            [$today, $today, $today],
        )->toBase()->first();

        if ($request->query('status') === 'done') {
            $tasks = (clone $scope)->whereNotNull('done_at')->orderByDesc('done_at')->orderByDesc('id');
        } else {
            $tasks = $open
                ->when($request->query('due') === 'overdue', fn (Builder $q) => $q->where('due_at', '<', $today))
                ->when($request->query('due') === 'today', fn (Builder $q) => $q->where('due_at', $today))
                ->when($request->query('due') === 'upcoming', fn (Builder $q) => $q->where(fn ($q) => $q->where('due_at', '>', $today)->orWhereNull('due_at')))
                ->orderByRaw('due_at IS NULL')->orderBy('due_at')->orderBy('id');
        }

        return TaskResource::collection($tasks->with(self::RELATIONS)->paginate(50))->additional([
            'today' => $today,
            'counts' => [
                'overdue' => (int) ($counts->overdue ?? 0),
                'today' => (int) ($counts->today ?? 0),
                'upcoming' => (int) ($counts->upcoming ?? 0),
            ],
        ]);
    }

    /** A task added by hand: always the signed-in user's own. */
    public function store(TaskRequest $request): JsonResponse
    {
        $user = $request->user();
        $task = new Task;
        $task->forceFill([
            'org_id' => $user->org_id,
            'client_id' => $request->validated('client_id'),
            'assignee_id' => $user->id,
            'title' => CallLogRequest::clean($request->validated('title')),
            'owner' => TaskOwner::Rep,
            'due_at' => $request->validated('due_date'),
        ])->save();

        return (new TaskResource($task->load(self::RELATIONS)))->response()->setStatusCode(201);
    }

    public function update(TaskRequest $request, Task $task): TaskResource
    {
        $data = $request->validated();
        if (array_key_exists('title', $data)) {
            $task->title = CallLogRequest::clean($data['title']);
        }
        if (array_key_exists('due_date', $data)) {
            $task->due_at = $data['due_date'];
        }
        if (array_key_exists('done', $data)) {
            $task->done_at = $data['done'] ? ($task->done_at ?? now()) : null;
        }
        $task->save();

        return new TaskResource($task->load(self::RELATIONS));
    }

    public function destroy(Task $task): JsonResponse
    {
        Gate::authorize('delete', $task);
        $task->delete();

        return response()->json(null, 204);
    }
}
