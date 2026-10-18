<?php

namespace App\Http\Controllers\Api;

use App\Enums\TaskOwner;
use App\Enums\VoiceNoteStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\CallLogRequest;
use App\Http\Requests\CallLogUpdateRequest;
use App\Http\Resources\CallLogResource;
use App\Models\CallLog;
use App\Models\Client;
use App\Models\Task;
use App\Models\VoiceNote;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class CallLogController extends Controller
{
    private const ALREADY_SAVED = 'A log has already been saved for this note. Edit that log instead.';

    // An action item due on the follow-up day that already reads like a follow-up makes the reminder redundant.
    private const FOLLOW_UP_WORDS = '/\b(follow[\s-]?up|call|ring|talk|speak|meet|check in)\b/i';

    /**
     * Saves the reviewed log for a note (FR-3.2) and turns its action items into tasks (FR-3.3), all in one
     * transaction. A note has at most one log: a second save is refused with 409 rather than treated as an update,
     * because it would create every task again. Later edits go through PUT /call-logs/{id}.
     */
    public function store(CallLogRequest $request, VoiceNote $voiceNote): JsonResponse
    {
        if ($voiceNote->status !== VoiceNoteStatus::Ready) {
            return response()->json(['message' => "This note isn't ready yet. Wait for the summary, then save the log."], 409);
        }
        if ($voiceNote->callLog()->exists()) {
            return response()->json(['message' => self::ALREADY_SAVED], 409);
        }

        $user = $request->user();
        $followUpDate = $request->validated('follow_up.date');

        try {
            $log = DB::transaction(function () use ($request, $voiceNote, $user, $followUpDate) {
                $client = $request->validated('new_client')
                    ? $user->organization->clients()->create([
                        'name' => CallLogRequest::clean($request->validated('new_client.name')),
                        'company' => CallLogRequest::clean($request->validated('new_client.company')) ?: null,
                    ])
                    : Client::where('org_id', $voiceNote->org_id)->findOrFail($request->validated('client_id'));

                $log = new CallLog;
                $log->forceFill([
                    'org_id' => $voiceNote->org_id,
                    'voice_note_id' => $voiceNote->id,
                    'user_id' => $user->id,
                    'client_id' => $client->id,
                    'summary' => trim($request->validated('summary')),
                    'sentiment' => $request->validated('sentiment'),
                    'follow_up_at' => $followUpDate,
                    'follow_up_phrase' => CallLogRequest::clean($request->validated('follow_up.phrase')) ?: null,
                ])->save();

                // Tasks belong to the rep whose call it was, even when a manager saves the log.
                $items = $request->includedItems();
                foreach ($items as $item) {
                    $this->createTask($log, $voiceNote, $item['text'], $item['owner'], $item['due_date'] ?? $followUpDate);
                }

                $covered = collect($items)->contains(fn ($item) => ($item['due_date'] ?? $followUpDate) === $followUpDate
                    && preg_match(self::FOLLOW_UP_WORDS, $item['text']));
                if ($followUpDate && ! $covered) {
                    $this->createTask($log, $voiceNote, "Follow up with {$client->name}", TaskOwner::Rep, $followUpDate);
                }

                $voiceNote->forceFill(['client_id' => $client->id])->save();

                return $log;
            });
        } catch (UniqueConstraintViolationException) {
            // Two saves raced past the check above; the unique index on voice_note_id let only one through.
            return response()->json(['message' => self::ALREADY_SAVED], 409);
        }

        return (new CallLogResource($this->loaded($log)))->response()->setStatusCode(201);
    }

    public function show(CallLog $callLog): CallLogResource
    {
        Gate::authorize('view', $callLog);

        return new CallLogResource($this->loaded($callLog));
    }

    /** Summary, sentiment and follow-up only. Tasks already created are left as they are. */
    public function update(CallLogUpdateRequest $request, CallLog $callLog): CallLogResource
    {
        $callLog->forceFill([
            'summary' => trim($request->validated('summary')),
            'sentiment' => $request->validated('sentiment'),
            'follow_up_at' => $request->validated('follow_up.date'),
            'follow_up_phrase' => CallLogRequest::clean($request->validated('follow_up.phrase')) ?: null,
        ])->save();

        return new CallLogResource($this->loaded($callLog));
    }

    private function createTask(CallLog $log, VoiceNote $note, string $title, TaskOwner $owner, ?string $due): void
    {
        $task = new Task;
        $task->forceFill([
            'org_id' => $note->org_id,
            'call_log_id' => $log->id,
            'client_id' => $log->client_id,
            'assignee_id' => $note->user_id,
            'title' => $title,
            'owner' => $owner,
            'due_at' => $due,
        ])->save();
    }

    private function loaded(CallLog $log): CallLog
    {
        return $log->load(['client:id,name', 'user:id,name', 'tasks.client:id,name', 'tasks.assignee:id,name', 'tasks.callLog:id,voice_note_id']);
    }
}
