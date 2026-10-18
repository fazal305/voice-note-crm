<?php

namespace App\Services\Transcription;

use App\Models\VoiceNote;

class NullTranscriber implements Transcriber
{
    public function available(): bool
    {
        return false;
    }

    public function transcribe(VoiceNote $note): string
    {
        throw new TranscriptionFailed('No speech-to-text service is configured.', retryable: false);
    }
}
