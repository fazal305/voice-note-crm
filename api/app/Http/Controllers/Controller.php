<?php

namespace App\Http\Controllers;

use Carbon\CarbonImmutable;

abstract class Controller
{
    /**
     * The calendar day to measure "overdue" and "upcoming" against. `today` is the browser's day, so it matches the
     * user's own clock; anything more than a day from the server's date is ignored.
     */
    protected function today(?string $claimed): string
    {
        $server = CarbonImmutable::now(config('app.timezone'))->startOfDay();
        if (is_string($claimed) && abs($server->diffInDays(CarbonImmutable::parse($claimed, config('app.timezone')))) <= 1) {
            return $claimed;
        }

        return $server->toDateString();
    }
}
