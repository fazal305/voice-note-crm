<?php

namespace App\Services\Parsing;

use Carbon\CarbonImmutable;

interface NoteParser
{
    /**
     * Turns a transcript into the structured note stored in voice_notes.ai_payload:
     * engine, model, summary, sentiment, action_items [{text, owner}], follow_ups [{date, phrase, description}],
     * mentions {people, companies}.
     *
     * @throws ParsingFailed
     */
    public function parse(string $transcript, CarbonImmutable $recordedAt, ?string $systemPrompt = null): array;
}
