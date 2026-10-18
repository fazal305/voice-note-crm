<?php

namespace Tests\Concerns;

use App\Enums\VoiceNoteStatus;
use App\Models\CallLog;
use App\Models\Client;
use App\Models\Task;
use App\Models\User;
use App\Models\VoiceNote;
use Closure;
use Illuminate\Support\Facades\DB;

/** Builds notes, saved logs and tasks directly, as the call-log endpoint would have left them. */
trait MakesCallHistory
{
    protected function voiceNote(User $owner, array $attributes = []): VoiceNote
    {
        $note = new VoiceNote;
        $note->forceFill(array_merge([
            'org_id' => $owner->org_id,
            'user_id' => $owner->id,
            'status' => VoiceNoteStatus::Ready,
            'source' => 'upload',
            'storage_key' => 'org-'.$owner->org_id.'/'.bin2hex(random_bytes(8)).'.enc',
            'mime' => 'audio/wav',
            'size_bytes' => 100,
            'attempts' => 1,
        ], $attributes))->save();

        return $note;
    }

    /** A saved log for a new note owned by $noteOwner (default: the author). */
    protected function callLog(User $author, Client $client, array $attributes = [], ?User $noteOwner = null): CallLog
    {
        $note = $this->voiceNote($noteOwner ?? $author, ['client_id' => $client->id]);
        $log = new CallLog;
        $log->forceFill(array_merge([
            'org_id' => $author->org_id,
            'voice_note_id' => $note->id,
            'user_id' => $author->id,
            'client_id' => $client->id,
            'summary' => 'A call.',
            'sentiment' => 'Neutral',
        ], $attributes))->save();

        return $log;
    }

    protected function taskFor(User $assignee, array $attributes = []): Task
    {
        $task = new Task;
        $task->forceFill(array_merge([
            'org_id' => $assignee->org_id,
            'assignee_id' => $assignee->id,
            'title' => 'A task',
            'owner' => 'rep',
        ], $attributes))->save();

        return $task;
    }

    /** How many queries $requests runs, after one warm-up run (the acting user caches its organization). */
    protected function countQueries(Closure $requests): int
    {
        $requests();
        DB::flushQueryLog();
        DB::enableQueryLog();
        $requests();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();
        DB::flushQueryLog();

        return $count;
    }
}
