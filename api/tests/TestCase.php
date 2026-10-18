<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // No test may reach a real speech-to-text or model API.
        Http::preventStrayRequests();
    }

    protected function asUser(User $user): static
    {
        Sanctum::actingAs($user);

        return $this;
    }
}
