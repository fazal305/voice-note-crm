<?php

namespace App\Services\Transcription;

use App\Models\VoiceNote;

interface Transcriber
{
    /** False when no speech-to-text service is configured, so notes wait for a manual transcript. */
    public function available(): bool;

    /** @throws TranscriptionFailed */
    public function transcribe(VoiceNote $note): string;
}
