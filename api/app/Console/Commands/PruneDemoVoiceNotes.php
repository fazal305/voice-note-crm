<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\Task;
use App\Models\VoiceNote;
use App\Services\AudioVault;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

#[Signature('voice-notes:prune-demo')]
#[Description('Delete demo-organization voice notes (with their audio and call logs) and tasks older than 24 hours')]
class PruneDemoVoiceNotes extends Command
{
    /**
     * The demo sign-in is shared by every visitor, so anything uploaded there must not linger for the next one.
     * A note whose audio can't be deleted is kept and tried again on the next run.
     */
    public function handle(AudioVault $vault): int
    {
        $pruned = 0;

        VoiceNote::query()
            ->whereIn('org_id', Organization::where('is_demo', true)->select('id'))
            ->where('created_at', '<', now()->subHours(24))
            ->chunkById(100, function ($notes) use ($vault, &$pruned) {
                foreach ($notes as $note) {
                    try {
                        $vault->delete($note->storage_key);
                    } catch (Throwable $e) {
                        Log::warning('Demo voice note audio could not be deleted.', ['voice_note_id' => $note->id, 'error' => $e->getMessage()]);

                        continue;
                    }
                    $note->delete();
                    $pruned++;
                }
            });

        // A note's call log goes with it; tasks outlive their log, so they are pruned on their own.
        $tasks = Task::whereIn('org_id', Organization::where('is_demo', true)->select('id'))
            ->where('created_at', '<', now()->subHours(24))
            ->delete();

        $this->info("Pruned {$pruned} demo voice note(s) and {$tasks} task(s).");

        return self::SUCCESS;
    }
}
