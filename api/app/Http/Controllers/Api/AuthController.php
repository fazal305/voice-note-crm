<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Creates a new organization with the registering user as its manager. Date of birth is never asked for or stored. */
    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = DB::transaction(function () use ($data) {
            $org = Organization::create(['name' => $data['organization']]);
            $org->settings()->create();

            $user = new User([
                'name' => $data['name'],
                'email' => Str::lower($data['email']),
                'password' => $data['password'],
            ]);
            $user->forceFill([
                'org_id' => $org->id,
                'role' => UserRole::Manager,
                'terms_accepted_at' => now(),
            ])->save();

            return $user;
        });

        return response()->json(['token' => $this->issueToken($user), 'user' => $user->toProfile()], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', Str::lower($request->validated('email')))->first();

        // One message for unknown email, wrong password and deactivated account, so accounts can't be probed.
        if (! $user || ! Hash::check($request->validated('password'), $user->password) || ! $user->isActive()) {
            throw ValidationException::withMessages(['email' => "That email and password don't match an active account."]);
        }

        return response()->json(['token' => $this->issueToken($user), 'user' => $user->toProfile()]);
    }

    /** Signs into the shared, clearly labelled demo organization created by DemoSeeder. */
    public function demo(Request $request): JsonResponse
    {
        abort_unless(config('services.demo.login_enabled'), 404, 'The demo is not available.');

        $data = $request->validate(['role' => ['required', Rule::enum(UserRole::class)]]);

        $user = User::query()
            ->whereHas('organization', fn ($q) => $q->where('is_demo', true))
            ->where('role', $data['role'])
            ->whereNull('deactivated_at')
            ->orderBy('id')
            ->first();

        abort_unless($user !== null, 404, 'The demo is not available.');

        return response()->json(['token' => $this->issueToken($user), 'user' => $user->toProfile()]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()->toProfile()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(null, 204);
    }

    private function issueToken(User $user): string
    {
        return $user->createToken('spa', ['*'], now()->addMinutes((int) config('sanctum.expiration')))->plainTextToken;
    }
}
