<?php

namespace App\Services;

use App\Models\Client;
use Illuminate\Support\Str;

/**
 * Suggests which client a note is about, from the names it mentions (FR-3.1). Only clients of the note's own
 * organization are ever considered. Nothing is assigned here: one strong match becomes a suggestion and
 * several become candidates, and the rep confirms either in the app.
 */
class ClientMatcher
{
    private const STRONG = 0.85;

    private const MAX_CANDIDATES = 5;

    private const COMPANY_SUFFIXES = ['the', 'inc', 'incorporated', 'llc', 'ltd', 'limited', 'co', 'corp', 'corporation', 'company', 'plc', 'gmbh'];

    /**
     * @param  list<string>  $mentions  people and company names extracted from the transcript
     * @return array{suggested: ?int, candidates: list<array{id: int, name: string}>}
     */
    public function match(int $orgId, array $mentions, string $transcript): array
    {
        $text = ' '.$this->normalize($transcript).' ';
        $mentions = array_values(array_filter(array_map(fn ($m) => $this->normalize((string) $m, true), $mentions), fn ($m) => strlen($m) >= 3));

        $strong = [];
        $weak = [];
        foreach (Client::where('org_id', $orgId)->orderBy('name')->get(['id', 'name', 'company']) as $client) {
            $names = array_values(array_filter([$this->normalize($client->name), $this->normalize((string) $client->company, true)], fn ($n) => strlen($n) >= 3));
            if ($names === []) {
                continue;
            }

            if ($this->isStrong($names, $mentions, $text)) {
                $strong[] = $client;
            } elseif ($this->isWeak($this->normalize($client->name), $mentions, $text)) {
                $weak[] = $client;
            }
        }

        if (count($strong) === 1) {
            return ['suggested' => $strong[0]->id, 'candidates' => []];
        }

        $pool = $strong ?: $weak;

        return [
            'suggested' => null,
            'candidates' => array_map(fn (Client $c) => ['id' => $c->id, 'name' => $c->name], array_slice($pool, 0, self::MAX_CANDIDATES)),
        ];
    }

    // The full name or company said in the note, or a mentioned name that is nearly identical to one of them.
    private function isStrong(array $names, array $mentions, string $text): bool
    {
        foreach ($names as $name) {
            if (str_contains($text, " {$name} ")) {
                return true;
            }
            foreach ($mentions as $mention) {
                if ($this->similarity($mention, $name) >= self::STRONG) {
                    return true;
                }
            }
        }

        return false;
    }

    // Only a first or last name in common: worth offering, not worth suggesting.
    private function isWeak(string $name, array $mentions, string $text): bool
    {
        $mentionWords = array_merge(...array_map(fn ($m) => explode(' ', $m), $mentions ?: ['']));
        foreach (explode(' ', $name) as $part) {
            if (strlen($part) >= 3 && (str_contains($text, " {$part} ") || in_array($part, $mentionWords, true))) {
                return true;
            }
        }

        return false;
    }

    private function similarity(string $a, string $b): float
    {
        similar_text($a, $b, $percent);

        return $percent / 100;
    }

    private function normalize(string $value, bool $company = false): string
    {
        $value = strtolower(Str::ascii($value));
        $value = str_replace('&', ' and ', $value);
        $value = trim(preg_replace('/\s+/', ' ', preg_replace('/[^a-z0-9 ]+/', ' ', $value)));
        if ($company) {
            $words = explode(' ', $value);
            $words = array_values(array_filter($words, fn ($w) => ! in_array($w, self::COMPANY_SUFFIXES, true)));
            while ($words && end($words) === 'and') {
                array_pop($words);
            }
            $value = implode(' ', $words);
        }

        return $value;
    }
}
