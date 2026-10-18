<?php

namespace App\Services\Parsing;

use Carbon\CarbonImmutable;

/**
 * Finds date phrases ("tomorrow", "next Tuesday", "in 3 days", "October 30th") and resolves them to a calendar
 * date relative to the day the note was recorded. A bare or "next" weekday means its first occurrence after
 * that day; the original phrase is always kept so the rep can see what was said.
 */
class DateResolver
{
    private const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

    private const WEEKDAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

    private const NUMBERS = ['a' => 1, 'an' => 1, 'one' => 1, 'two' => 2, 'three' => 3, 'four' => 4, 'five' => 5, 'six' => 6, 'seven' => 7, 'eight' => 8, 'nine' => 9, 'ten' => 10, 'couple of' => 2, 'few' => 3];

    /** @return list<array{phrase: string, date: string}> in the order they appear */
    public function find(string $text, CarbonImmutable $base): array
    {
        $found = [];
        foreach ($this->patterns() as $pattern) {
            if (! preg_match_all($pattern, $text, $matches, PREG_OFFSET_CAPTURE)) {
                continue;
            }
            foreach ($matches[0] as [$phrase, $offset]) {
                $end = $offset + strlen($phrase);
                foreach ($found as $existing) {
                    if ($offset < $existing['end'] && $end > $existing['offset']) {
                        continue 2;
                    }
                }
                $date = $this->resolve($phrase, $base);
                if ($date) {
                    $found[] = ['phrase' => trim($phrase), 'date' => $date->toDateString(), 'offset' => $offset, 'end' => $end];
                }
            }
        }

        usort($found, fn ($a, $b) => $a['offset'] <=> $b['offset']);

        return array_map(fn ($f) => ['phrase' => $f['phrase'], 'date' => $f['date']], $found);
    }

    public function resolve(string $phrase, CarbonImmutable $base): ?CarbonImmutable
    {
        $p = strtolower(trim(preg_replace('/\s+/', ' ', $phrase)));
        $today = $base->startOfDay();
        $months = self::MONTHS;
        $weekdays = self::WEEKDAYS;

        if (preg_match('/\b(\d{4})-(\d{2})-(\d{2})\b/', $p, $m)) {
            return checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? CarbonImmutable::create((int) $m[1], (int) $m[2], (int) $m[3]) : null;
        }
        if (preg_match("/\b($months)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?\b/", $p, $m)) {
            return $this->monthDay($m[1], (int) $m[2], isset($m[3]) && $m[3] !== '' ? (int) $m[3] : null, $today);
        }
        if (preg_match("/\b(\d{1,2})(?:st|nd|rd|th)? (?:of )?($months)\b\.?(?:,? (\d{4}))?/", $p, $m)) {
            return $this->monthDay($m[2], (int) $m[1], isset($m[3]) && $m[3] !== '' ? (int) $m[3] : null, $today);
        }
        if (str_contains($p, 'day after tomorrow')) {
            return $today->addDays(2);
        }
        if (preg_match('/\btomorrow\b/', $p)) {
            return $today->addDay();
        }
        if (preg_match('/\b(today|tonight|end of (?:the )?day)\b/', $p)) {
            return $today;
        }
        if (preg_match("/\bthis ($weekdays)\b/", $p, $m)) {
            return strtolower($today->englishDayOfWeek) === $m[1] ? $today : $today->next(ucfirst($m[1]));
        }
        if (preg_match("/\b($weekdays)\b/", $p, $m)) {
            return $today->next(ucfirst($m[1]));
        }
        if (preg_match('/\bend of (?:the |this )?week\b/', $p)) {
            return $today->isFriday() ? $today : $today->next('Friday');
        }
        if (preg_match('/\bnext week\b/', $p)) {
            return $today->next('Monday');
        }
        if (preg_match('/\bend of (?:the |this )?month\b/', $p)) {
            return $today->endOfMonth()->startOfDay();
        }
        if (preg_match('/\bnext month\b/', $p)) {
            return $today->addMonthNoOverflow()->startOfMonth();
        }
        if (preg_match('/\bin (\d{1,3}|a couple of|a few|an?|one|two|three|four|five|six|seven|eight|nine|ten) (day|week|month)s?\b/', $p, $m)) {
            $count = ctype_digit($m[1]) ? (int) $m[1] : (self::NUMBERS[preg_replace('/^a /', '', $m[1])] ?? 1);

            return match ($m[2]) {
                'day' => $today->addDays($count),
                'week' => $today->addWeeks($count),
                'month' => $today->addMonthsNoOverflow($count),
            };
        }

        return null;
    }

    private function patterns(): array
    {
        $months = self::MONTHS;
        $weekdays = self::WEEKDAYS;

        return [
            '/\b\d{4}-\d{2}-\d{2}\b/',
            "/\b(?:$months)\.? \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?\b/i",
            "/\b\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:$months)\b(?:,? \d{4})?/i",
            '/\b(?:the )?day after tomorrow\b/i',
            '/\b(?:by |on )?tomorrow\b/i',
            "/\b(?:by |on |until |before )?(?:next |this |coming )?(?:$weekdays)\b/i",
            '/\b(?:by )?(?:the )?end of (?:the |this )?(?:week|month)\b/i',
            '/\bnext (?:week|month)\b/i',
            '/\bin (?:\d{1,3}|a couple of|a few|an?|one|two|three|four|five|six|seven|eight|nine|ten) (?:day|week|month)s?\b/i',
        ];
    }

    private function monthDay(string $month, int $day, ?int $year, CarbonImmutable $today): ?CarbonImmutable
    {
        $number = (int) date('n', strtotime(substr($month, 0, 3).' 1 2000'));
        if (! checkdate($number, $day, $year ?? $today->year)) {
            return null;
        }
        $date = CarbonImmutable::create($year ?? $today->year, $number, $day);

        // With no year given, a date well in the past means next year's ("March 3rd" said in December).
        return $year === null && $date->lt($today->subDays(7)) ? $date->addYear() : $date;
    }
}
