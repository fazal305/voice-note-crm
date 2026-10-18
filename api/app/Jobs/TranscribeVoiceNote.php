<?php

namespace App\Jobs;

use App\Enums\VoiceNoteStatus;
use App\Models\VoiceNote;
use App\Services\Transcription\Transcriber;
use App\Services\Transcription\TranscriptionFailed;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Step 1 of processing: audio to text. Chained with ParseVoiceNote, which bails out if no transcript was made. */
class TranscribeVoiceNote implements ShouldQueue
{
    use Queueable;

    public const FAILED_MESSAGE = "We couldn't transcribe this note. Try again, or type the transcript yourself.";

    public const NO_SPEECH_MESSAGE = "We couldn't hear any speech in this recording. Type the transcript yourself, or record the note again.";

    public int $tries = 3;

    public array $backoff = [10, 30];

    public int $timeout = 120;

    public function __construct(public int $noteId) {}

    public function handle(Transcriber $transcriber): void
    {
        $note = VoiceNote::find($this->noteId);
        // Idempotent: a deleted note, one that already has its transcript, or one moved on by another run is left alone.
        if (! $note || $note->transcript !== null || ! in_array($note->status, [VoiceNoteStatus::Uploaded, VoiceNoteStatus::Transcribing], true)) {
            return;
        }

        if (! $transcriber->available()) {
            $note->forceFill(['status' => VoiceNoteStatus::AwaitingTranscript])->save();

            return;
        }

        $note->forceFill(['status' => VoiceNoteStatus::Transcribing])->save();

        try {
            $text = $transcriber->transcribe($note);
        } catch (TranscriptionFailed $e) {
            if (! $e->retryable) {
                $this->fail($e);

                return;
            }
            throw $e;
        }

        if ($text === '') {
            $note->forceFill(['status' => VoiceNoteStatus::Failed, 'error' => self::NO_SPEECH_MESSAGE])->save();

            return;
        }

        $note->forceFill(['transcript' => $text, 'status' => VoiceNoteStatus::Parsing])->save();
    }

    public function failed(?Throwable $e): void
    {
        // Details stay in the log; the user only ever sees the generic message.
        Log::error('Voice note transcription failed.', ['voice_note_id' => $this->noteId, 'error' => $e?->getMessage()]);

        VoiceNote::whereKey($this->noteId)
            ->whereIn('status', [VoiceNoteStatus::Uploaded->value, VoiceNoteStatus::Transcribing->value])
            ->update(['status' => VoiceNoteStatus::Failed->value, 'error' => self::FAILED_MESSAGE, 'updated_at' => now()]);
    }
}
