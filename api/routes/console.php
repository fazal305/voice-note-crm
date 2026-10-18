<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Where cron is available (`* * * * * php artisan schedule:run`). Hosts without it use POST /api/cron/run instead.
Schedule::command('voice-notes:prune-demo')->hourly();
