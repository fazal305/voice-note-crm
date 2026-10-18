<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;

/**
 * Lets an external scheduler (the "Demo cleanup" GitHub Action) run the demo prune on hosts without cron or
 * that sleep when idle. Disabled unless CRON_SECRET is set; the secret is compared in constant time.
 */
class CronController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $secret = (string) config('services.cron.secret');
        if ($secret === '' || ! hash_equals($secret, (string) $request->bearerToken())) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $lock = Cache::lock('cron:run', 300);
        if (! $lock->get()) {
            return response()->json(['message' => 'A run is already in progress.'], 409);
        }

        try {
            Artisan::call('voice-notes:prune-demo');
            $prune = trim(Artisan::output());
        } finally {
            $lock->release();
        }

        return response()->json(['message' => 'OK', 'prune' => $prune]);
    }
}
