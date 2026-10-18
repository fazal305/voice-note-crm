<?php

namespace App\Jobs;

use App\Enums\VoiceNoteStatus;
use App\Models\OrgSetting;
use App\Models\VoiceNote;
use App\Services\ClientMatcher;
use App\Services\Parsing\NoteParser;
use App\Services\Parsing\ParsingFailed;
use App\Services\Parsing\RuleBasedParser;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Step 2 of processing: transcript to structured note, plus a client suggestion. The raw transcript is never
 * replaced, so it stays readable whatever the parser made of it (FR-2.3).
 */
class ParseVoiceNote implements ShouldQueue
{
    use Queueable;

    public const FAILED_MESSAGE = "We couldn't analyze this note. Please try again.";

    public int $tries = 2;

    public int $backoff = 15;

    public int $timeout = 120;

    public function __construct(public int $noteId) {}

    public function handle(NoteParser $parser, RuleBasedParser $rules, ClientMatcher $matcher): void
    {
        $note = VoiceNote::find($this->noteId);
        // Idempotent: only a note that has a transcript and is waiting to be parsed is touched.
        if (! $note || $note->transcript === null || $note->status !== VoiceNoteStatus::Parsing) {
            return;
        }

        $recordedAt = CarbonImmutable::parse($note->created_at)->setTimezone(config('app.timezone'));
        $prompt = OrgSetting::where('org_id', $note->org_id)->value('system_prompt');

        try {
            $payload = $parser->parse($note->transcript, $recordedAt, $prompt);
        } catch (ParsingFailed $e) {
            Log::warning('Voice note parsed with rules after the model failed.', ['voice_note_id' => $note->id, 'error' => $e->getMessage()]);
            $payload = $rules->parse($note->transcript, $recordedAt, $prompt);
        }

        $match = ['suggested' => null, 'candidates' => []];
        if ($note->client_id === null) {
            $match = $matcher->match($note->org_id, [...$payload['mentions']['people'], ...$payload['mentions']['companies']], $note->transcript);
        }

        $note->forceFill([
            'ai_payload' => $payload,
            'suggested_client_id' => $match['suggested'],
            'match_candidates' => $match['candidates'] ?: null,
            'status' => VoiceNoteStatus::Ready,
            'error' => null,
            'processed_at' => now(),
        ])->save();
    }

    public function failed(?Throwable $e): void
    {
        Log::error('Voice note parsing failed.', ['voice_note_id' => $this->noteId, 'error' => $e?->getMessage()]);

        VoiceNote::whereKey($this->noteId)
            ->where('status', VoiceNoteStatus::Parsing->value)
            ->update(['status' => VoiceNoteStatus::Failed->value, 'error' => self::FAILED_MESSAGE, 'updated_at' => now()]);
    }
}
