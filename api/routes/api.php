<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CallLogController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\CronController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\SummaryController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\VoiceNoteController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => ['status' => 'ok']);

Route::post('/demo/login', [AuthController::class, 'demo'])->middleware('throttle:demo');

Route::post('/cron/run', CronController::class)->middleware('throttle:auth');

Route::middleware('throttle:auth')->prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/me/summary', SummaryController::class);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/clients', [ClientController::class, 'index']);
    Route::post('/clients', [ClientController::class, 'store']);
    Route::whereNumber('client')->group(function () {
        Route::get('/clients/{client}', [ClientController::class, 'show']);
        Route::get('/clients/{client}/timeline', [ClientController::class, 'timeline']);
        Route::put('/clients/{client}', [ClientController::class, 'update']);
        Route::delete('/clients/{client}', [ClientController::class, 'destroy']);
    });

    Route::get('/voice-notes', [VoiceNoteController::class, 'index']);
    Route::post('/voice-notes', [VoiceNoteController::class, 'store'])->middleware('throttle:uploads');
    Route::whereNumber('voiceNote')->group(function () {
        Route::get('/voice-notes/{voiceNote}', [VoiceNoteController::class, 'show']);
        Route::get('/voice-notes/{voiceNote}/audio', [VoiceNoteController::class, 'audio']);
        Route::post('/voice-notes/{voiceNote}/retry', [VoiceNoteController::class, 'retry'])->middleware('throttle:processing');
        Route::post('/voice-notes/{voiceNote}/transcript', [VoiceNoteController::class, 'transcript'])->middleware('throttle:processing');
        Route::delete('/voice-notes/{voiceNote}', [VoiceNoteController::class, 'destroy']);
        Route::post('/voice-notes/{voiceNote}/call-log', [CallLogController::class, 'store']);
    });

    Route::whereNumber('callLog')->group(function () {
        Route::get('/call-logs/{callLog}', [CallLogController::class, 'show']);
        Route::put('/call-logs/{callLog}', [CallLogController::class, 'update']);
    });

    Route::get('/tasks', [TaskController::class, 'index']);
    Route::post('/tasks', [TaskController::class, 'store']);
    Route::whereNumber('task')->group(function () {
        Route::patch('/tasks/{task}', [TaskController::class, 'update']);
        Route::delete('/tasks/{task}', [TaskController::class, 'destroy']);
    });

    Route::middleware('can:manage-team')->prefix('team')->group(function () {
        Route::get('/', [TeamController::class, 'index']);
        Route::post('/', [TeamController::class, 'store']);
        Route::whereNumber('user')->group(function () {
            Route::put('/{user}', [TeamController::class, 'update']);
            Route::post('/{user}/deactivate', [TeamController::class, 'deactivate']);
        });
    });

    // Manager-only areas share the team gate (and its "for managers only" 403).
    Route::middleware('can:manage-team')->group(function () {
        Route::get('/dashboard', DashboardController::class);
        Route::get('/settings/prompt', [SettingsController::class, 'prompt']);
        Route::put('/settings/prompt', [SettingsController::class, 'updatePrompt']);
    });
});
