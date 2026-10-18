<?php

namespace App\Services\Transcription;

use App\Models\VoiceNote;
use App\Services\AudioVault;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Transcribes through any OpenAI-compatible /audio/transcriptions endpoint (Groq's Whisper by default).
 * The audio is decrypted into memory only and sent as a multipart upload; it never touches disk in plain form.
 */
class GroqTranscriber implements Transcriber
{
    private const EXTENSIONS = [
        'audio/mpeg' => 'mp3',
        'audio/wav' => 'wav',
        'audio/mp4' => 'm4a',
        'audio/webm' => 'webm',
        'audio/ogg' => 'ogg',
    ];

    public function __construct(private AudioVault $vault) {}

    public function available(): bool
    {
        return true;
    }

    public function transcribe(VoiceNote $note): string
    {
        $audio = $this->vault->get($note->storage_key);
        $name = 'note.'.(self::EXTENSIONS[$note->mime] ?? 'wav');

        try {
            $response = Http::withToken((string) config('services.stt.api_key'))
                ->acceptJson()
                ->timeout(90)
                ->attach('file', $audio, $name, ['Content-Type' => $note->mime])
                ->post(rtrim((string) config('services.stt.base_url'), '/').'/audio/transcriptions', [
                    'model' => (string) config('services.stt.model'),
                    'response_format' => 'json',
                    'temperature' => '0',
                ]);
        } catch (ConnectionException $e) {
            throw new TranscriptionFailed('Speech-to-text service could not be reached.', previous: $e);
        } finally {
            unset($audio);
        }

        if (! $response->successful()) {
            // Rate limits and server errors are worth retrying; a rejected request (bad key, unsupported file) is not.
            $retryable = $response->status() === 429 || $response->serverError();
            throw new TranscriptionFailed("Speech-to-text returned HTTP {$response->status()}.", $retryable);
        }

        $text = $response->json('text');
        if (! is_string($text)) {
            throw new TranscriptionFailed('Speech-to-text response had no text.');
        }

        return trim($text);
    }
}
