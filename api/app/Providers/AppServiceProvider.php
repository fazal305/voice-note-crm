<?php

namespace App\Providers;

use App\Models\User;
use App\Services\Parsing\LlmParser;
use App\Services\Parsing\NoteParser;
use App\Services\Parsing\RuleBasedParser;
use App\Services\Transcription\GroqTranscriber;
use App\Services\Transcription\NullTranscriber;
use App\Services\Transcription\Transcriber;
use Illuminate\Auth\Access\Response;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // External services are used only when their keys are set; otherwise notes wait for a typed transcript
        // and are parsed with basic rules.
        $this->app->bind(Transcriber::class, fn ($app) => filled(config('services.stt.api_key'))
            ? $app->make(GroqTranscriber::class)
            : $app->make(NullTranscriber::class));

        $this->app->bind(NoteParser::class, fn ($app) => filled(config('services.llm.api_key'))
            ? $app->make(LlmParser::class)
            : $app->make(RuleBasedParser::class));
    }

    public function boot(): void
    {
        // A deactivated user's tokens are revoked, and any that slip through are refused here too.
        Sanctum::authenticateAccessTokensUsing(
            fn (PersonalAccessToken $token, bool $isValid) => $isValid && $token->tokenable instanceof User && $token->tokenable->isActive(),
        );

        Gate::define('manage-team', fn (User $user) => $user->isManager()
            ? Response::allow()
            : Response::deny('This area is for managers only.'));

        Gate::define('create-rep', fn (User $user) => $user->organization->is_demo
            ? Response::deny('Team changes are turned off in the demo.')
            : Response::allow());

        $tooMany = fn (Request $request, array $headers) => response()->json(
            ['message' => 'Too many requests. Please wait a minute and try again.'],
            429,
            $headers,
        );

        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)
            ->by($request->user()?->id ?: $request->ip())->response($tooMany));

        RateLimiter::for('auth', function (Request $request) use ($tooMany) {
            $limits = [Limit::perMinute(10)->by('auth-ip:'.$request->ip())->response($tooMany)];
            $email = $request->input('email');
            if (is_string($email) && $email !== '') {
                $limits[] = Limit::perMinute(10)->by('auth-email:'.Str::lower(trim($email)))->response($tooMany);
            }

            return $limits;
        });

        RateLimiter::for('demo', fn (Request $request) => [
            Limit::perMinute(5)->by('demo-min:'.$request->ip())->response($tooMany),
            Limit::perDay(60)->by('demo-day:'.$request->ip())->response($tooMany),
        ]);

        // Per user, plus a looser per-IP cap so one office's reps behind a shared IP aren't blocked by each other.
        RateLimiter::for('uploads', fn (Request $request) => [
            Limit::perMinute(10)->by('upload-user-min:'.$request->user()?->id)->response($tooMany),
            Limit::perDay(100)->by('upload-user-day:'.$request->user()?->id)->response($tooMany),
            Limit::perMinute(30)->by('upload-ip-min:'.$request->ip())->response($tooMany),
            Limit::perDay(300)->by('upload-ip-day:'.$request->ip())->response($tooMany),
        ]);

        // Retries and typed transcripts each start a paid transcription or model call.
        RateLimiter::for('processing', fn (Request $request) => [
            Limit::perMinute(6)->by('process-user-min:'.$request->user()?->id)->response($tooMany),
            Limit::perDay(60)->by('process-user-day:'.$request->user()?->id)->response($tooMany),
            Limit::perMinute(20)->by('process-ip-min:'.$request->ip())->response($tooMany),
            Limit::perDay(200)->by('process-ip-day:'.$request->ip())->response($tooMany),
        ]);
    }
}
