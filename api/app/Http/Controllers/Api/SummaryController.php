<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CallLog;
use App\Models\Task;
use App\Models\VoiceNote;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The signed-in user's own snapshot for the Record page: this week's notes, their tasks and next follow-ups. */
class SummaryController extends Controller
{
    private const FOLLOW_UPS = 5;

    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['today' => ['nullable', 'date_format:Y-m-d']]);
        $user = $request->user();
        $today = $this->today($request->query('today'));
        $weekStart = CarbonImmutable::parse($today, config('app.timezone'))->startOfWeek();

        $tasks = Task::where('assignee_id', $user->id)->whereNull('done_at')
            ->selectRaw('COUNT(*) AS open, SUM(CASE WHEN due_at < ? THEN 1 ELSE 0 END) AS overdue', [$today])
            ->toBase()->first();

        $followUps = CallLog::visibleTo($user)
            ->where('follow_up_at', '>=', $today)
            ->with('client:id,name')
            ->orderBy('follow_up_at')->orderBy('call_logs.id')
            ->limit(self::FOLLOW_UPS)
            ->get(['call_logs.id', 'call_logs.client_id', 'follow_up_at', 'follow_up_phrase'])
            ->map(fn (CallLog $log) => [
                'date' => $log->follow_up_at,
                'phrase' => $log->follow_up_phrase,
                'client' => $log->client ? ['id' => $log->client->id, 'name' => $log->client->name] : null,
            ]);

        return response()->json([
            'today' => $today,
            'week_start' => $weekStart->toDateString(),
            'notes_this_week' => VoiceNote::where('user_id', $user->id)->where('created_at', '>=', $weekStart)->count(),
            'open_tasks' => (int) ($tasks->open ?? 0),
            'overdue_tasks' => (int) ($tasks->overdue ?? 0),
            'next_follow_ups' => $followUps,
        ]);
    }
}
