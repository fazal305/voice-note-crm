<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RepRequest;
use App\Http\Resources\TeamMemberResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

class TeamController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return TeamMemberResource::collection(
            $request->user()->organization->users()->orderBy('role')->orderBy('name')->get(),
        );
    }

    public function store(RepRequest $request): JsonResponse
    {
        $data = $request->validated();
        $rep = new User(['name' => $data['name'], 'email' => Str::lower($data['email']), 'password' => $data['password']]);
        $rep->forceFill(['org_id' => $request->user()->org_id])->save();

        return (new TeamMemberResource($rep))->response()->setStatusCode(201);
    }

    public function update(RepRequest $request, User $user): TeamMemberResource
    {
        $data = $request->validated();
        $user->update(['name' => $data['name'], 'email' => Str::lower($data['email'])]);

        return new TeamMemberResource($user);
    }

    public function deactivate(User $user): TeamMemberResource
    {
        Gate::authorize('deactivate', $user);

        DB::transaction(function () use ($user) {
            $user->forceFill(['deactivated_at' => $user->deactivated_at ?? now()])->save();
            $user->tokens()->delete();
        });

        return new TeamMemberResource($user);
    }
}
