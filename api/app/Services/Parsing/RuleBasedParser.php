<?php

namespace App\Services\Parsing;

use Carbon\CarbonImmutable;

/**
 * The fallback parser: no network, fully deterministic. It is used when no model is configured, and whenever
 * the model fails or answers with something unusable. Its results are marked engine "rules" so the UI can
 * say they need a closer look.
 */
class RuleBasedParser implements NoteParser
{
    private const FRUSTRATED = '/\b(frustrat\w*|annoy\w*|upset|angry|unhappy|disappoint\w*|complain\w*|fed up|not happy|furious|irritat\w*|concerned|worried|cancel\w*|delay\w*|problem|issue)\b/i';

    private const POSITIVE = '/\b(great|happy|excited|love[ds]?|loving|interested|pleased|keen|impressed|good|excellent|thrilled|glad|enthusiastic|on board|signed|positive)\b/i';

    private const REP = "/\\b(I'll|I will|I'm going to|I am going to|I need to|I have to|I promised|we'll|we will|we're going to|we need to|let me)\\b/i";

    private const CLIENT = "/\\b(they'll|they will|they're going to|they need to|they promised|he'll|he will|he's going to|he needs to|he promised|she'll|she will|she's going to|she needs to|she promised|the client will)\\b/i";

    private const TASK = '/\b(send|follow up|follow-up|schedule|set up|book|call (?:him|her|them) back|get back to|prepare|draft|confirm|email)\b/i';

    private const NOT_NAMES = [
        'I', "I'll", "I'm", 'The', 'A', 'We', "We'll", 'They', "They'll", 'He', 'She', 'It', 'So', 'And', 'But', 'Also', 'Just', 'Then',
        'Okay', 'Ok', 'OK', 'Hi', 'Hey', 'Yes', 'No', 'Next', 'This', 'That', 'Today', 'Tomorrow', 'Monday', 'Tuesday', 'Wednesday',
        'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December', 'Called', 'Spoke', 'Talked', 'Met', 'Had', 'Quick', 'Note', 'Call',
        'Overall', 'Need', 'Let', 'Will', 'Our', 'My', 'Their', 'His', 'Her', 'If', 'When', 'After', 'Before', 'Just',
    ];

    public function __construct(private DateResolver $dates) {}

    public function parse(string $transcript, CarbonImmutable $recordedAt, ?string $systemPrompt = null): array
    {
        $sentences = $this->sentences($transcript);

        return ParsedNote::make(
            engine: 'rules',
            model: null,
            summary: $this->summary($sentences),
            sentiment: $this->sentiment($transcript),
            actionItems: $this->actionItems($sentences),
            followUps: $this->followUps($sentences, $recordedAt),
            people: [],
            companies: $this->capitalisedNames($transcript),
        );
    }

    private function sentences(string $text): array
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');

        return array_values(array_filter(array_map('trim', preg_split('/(?<=[.!?])\s+/u', $text) ?: [])));
    }

    // The first two or three sentences, stopping at two when they already say plenty.
    private function summary(array $sentences): string
    {
        $summary = '';
        foreach (array_slice($sentences, 0, 3) as $i => $sentence) {
            if ($i === 2 && mb_strlen($summary) > 250) {
                break;
            }
            $summary .= ($summary === '' ? '' : ' ').$sentence;
        }

        return $summary;
    }

    private function sentiment(string $text): string
    {
        $frustrated = preg_match_all(self::FRUSTRATED, $text);
        $positive = preg_match_all(self::POSITIVE, $text);

        if ($frustrated > 0 && $frustrated >= $positive) {
            return 'Frustrated';
        }

        return $positive > 0 ? 'Positive' : 'Neutral';
    }

    // A sentence with a commitment ("I'll", "they will") or a task verb is an action item; whoever is named first owns it.
    private function actionItems(array $sentences): array
    {
        $items = [];
        foreach ($sentences as $sentence) {
            $rep = preg_match(self::REP, $sentence, $r, PREG_OFFSET_CAPTURE) ? $r[0][1] : null;
            $client = preg_match(self::CLIENT, $sentence, $c, PREG_OFFSET_CAPTURE) ? $c[0][1] : null;
            if ($rep === null && $client === null && ! preg_match(self::TASK, $sentence)) {
                continue;
            }
            $owner = $client !== null && ($rep === null || $client < $rep) ? 'client' : 'rep';
            $items[] = ['text' => rtrim($sentence, '.'), 'owner' => $owner];
        }

        return $items;
    }

    private function followUps(array $sentences, CarbonImmutable $recordedAt): array
    {
        $followUps = [];
        foreach ($sentences as $sentence) {
            foreach ($this->dates->find($sentence, $recordedAt) as $found) {
                $followUps[] = ['date' => $found['date'], 'phrase' => $found['phrase'], 'description' => rtrim($sentence, '.')];
            }
        }

        return $followUps;
    }

    /** Runs of capitalised words, minus sentence openers, weekdays and months: likely people and companies. */
    private function capitalisedNames(string $text): array
    {
        preg_match_all("/\\b\\p{Lu}[\\p{L}'&-]*(?:\\s+(?:&\\s+)?\\p{Lu}[\\p{L}'&.-]*)*/u", $text, $matches);

        $names = [];
        foreach ($matches[0] as $run) {
            $words = preg_split('/\s+/', rtrim($run, '.'));
            while ($words && in_array(rtrim($words[0], '.,'), self::NOT_NAMES, true)) {
                array_shift($words);
            }
            while ($words && in_array(rtrim(end($words), '.,'), self::NOT_NAMES, true)) {
                array_pop($words);
            }
            $name = implode(' ', $words);
            if (mb_strlen($name) >= 3) {
                $names[] = $name;
            }
        }

        return $names;
    }
}
