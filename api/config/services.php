<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'demo' => [
        'login_enabled' => (bool) env('DEMO_LOGIN_ENABLED', true),
    ],

    // Speech to text through any OpenAI-compatible /audio/transcriptions endpoint (Groq's Whisper by default).
    // With no key, notes wait for a transcript typed or pasted by the user.
    'stt' => [
        'base_url' => env('STT_BASE_URL', 'https://api.groq.com/openai/v1'),
        'api_key' => env('STT_API_KEY'),
        'model' => env('STT_MODEL', 'whisper-large-v3-turbo'),
    ],

    // Transcript parsing through any OpenAI-compatible chat completions endpoint. With no key, or when the
    // model fails, notes are parsed with basic rules instead.
    'llm' => [
        'base_url' => env('LLM_BASE_URL', 'https://openrouter.ai/api/v1'),
        'api_key' => env('LLM_API_KEY'),
        'model' => env('LLM_MODEL', 'google/gemma-4-31b-it:free'),
        // Used when an organization has not written its own system prompt (org_settings.system_prompt).
        'system_prompt' => "You turn a sales rep's spoken note about a client call into CRM data. "
            .'Be factual and concise, and only record what the note actually says: never invent names, dates, prices or commitments.',
    ],

    'cron' => [
        'secret' => env('CRON_SECRET'),
    ],

];
