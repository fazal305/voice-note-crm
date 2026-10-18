<?php

namespace App\Services\Parsing;

use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

/**
 * Builds the one payload shape every parser returns. Whatever a parser (or a model) produced, only these keys
 * survive, every string is trimmed and length-capped, and enumerations are checked against their allowed values.
 */
class ParsedNote
{
    public const SENTIMENTS = ['Positive', 'Neutral', 'Frustrated'];

    public const OWNERS = ['rep', 'client'];

    public const MAX_SUMMARY = 600;

    public static function sentiment(mixed $value): string
    {
        if (is_string($value)) {
            foreach (self::SENTIMENTS as $allowed) {
                if (strcasecmp(trim($value), $allowed) === 0) {
                    return $allowed;
                }
            }
        }

        return 'Neutral';
    }

    public static function text(mixed $value, int $max): string
    {
        if (! is_string($value)) {
            return '';
        }
        // Control characters out, whitespace collapsed.
        $value = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $value) ?? '';

        return Str::limit(trim(preg_replace('/\s+/u', ' ', $value) ?? ''), $max, '…');
    }

    /**
     * @param  list<array{text: string, owner: string}>  $actionItems
     * @param  list<array{date: string, phrase: string, description?: string}>  $followUps
     */
    public static function make(string $engine, ?string $model, string $summary, string $sentiment, array $actionItems, array $followUps, array $people, array $companies): array
    {
        return [
            'engine' => $engine,
            'model' => $model,
            'summary' => self::text($summary, self::MAX_SUMMARY),
            'sentiment' => self::sentiment($sentiment),
            'action_items' => collect($actionItems)
                ->filter(fn ($item) => is_array($item) && in_array($item['owner'] ?? null, self::OWNERS, true) && self::text($item['text'] ?? null, 200) !== '')
                ->map(fn ($item) => ['text' => self::text($item['text'], 200), 'owner' => $item['owner']])
                ->unique('text')->take(10)->values()->all(),
            'follow_ups' => collect($followUps)
                ->filter(fn ($item) => is_array($item) && self::validDate($item['date'] ?? null) && self::text($item['phrase'] ?? null, 120) !== '')
                ->map(fn ($item) => [
                    'date' => $item['date'],
                    'phrase' => self::text($item['phrase'], 120),
                    'description' => self::text($item['description'] ?? '', 200),
                ])
                ->unique(fn ($item) => $item['date'].'|'.$item['phrase'])->take(6)->values()->all(),
            'mentions' => [
                'people' => self::names($people),
                'companies' => self::names($companies),
            ],
        ];
    }

    private static function names(array $names): array
    {
        return collect($names)
            ->map(fn ($name) => self::text($name, 80))
            ->filter()->unique(fn ($name) => mb_strtolower($name))->take(10)->values()->all();
    }

    public static function validDate(mixed $value): bool
    {
        if (! is_string($value) || ! preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)) {
            return false;
        }

        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    /** Model-supplied dates are accepted only within a sane window around the recording day. */
    public static function plausibleDate(mixed $value, CarbonImmutable $recordedAt): bool
    {
        if (! self::validDate($value)) {
            return false;
        }
        $date = CarbonImmutable::parse($value);

        return $date->gte($recordedAt->startOfDay()->subYear()) && $date->lte($recordedAt->startOfDay()->addYears(2));
    }
}
