<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\CronController;
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
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/clients', [ClientController::class, 'index']);
    Route::post('/clients', [ClientController::class, 'store']);
    Route::whereNumber('client')->group(function () {
        Route::get('/clients/{client}', [ClientController::class, 'show']);
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
    });

    Route::middleware('can:manage-team')->prefix('team')->group(function () {
        Route::get('/', [TeamController::class, 'index']);
        Route::post('/', [TeamController::class, 'store']);
        Route::whereNumber('user')->group(function () {
            Route::put('/{user}', [TeamController::class, 'update']);
            Route::post('/{user}/deactivate', [TeamController::class, 'deactivate']);
        });
    });
});
