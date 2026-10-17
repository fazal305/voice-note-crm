<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ClientRequest;
use App\Http\Resources\ClientResource;
use App\Models\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class ClientController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $request->validate(['search' => ['nullable', 'string', 'max:120']]);
        $search = trim((string) $request->query('search', ''));

        $clients = $request->user()->organization->clients()
            ->when($search !== '', function ($query) use ($search) {
                $like = '%'.addcslashes($search, '\\%_').'%';
                $query->where(fn ($q) => $q->where('name', 'like', $like)->orWhere('company', 'like', $like));
            })
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(50);

        return ClientResource::collection($clients);
    }

    public function store(ClientRequest $request): JsonResponse
    {
        $client = $request->user()->organization->clients()->create($request->validated());

        return (new ClientResource($client))->response()->setStatusCode(201);
    }

    public function show(Client $client): ClientResource
    {
        Gate::authorize('view', $client);

        return new ClientResource($client);
    }

    public function update(ClientRequest $request, Client $client): ClientResource
    {
        // PUT replaces the record, so optional fields left out are cleared.
        $client->update(array_merge(['company' => null, 'email' => null, 'phone' => null, 'notes' => null], $request->validated()));

        return new ClientResource($client);
    }

    public function destroy(Client $client): JsonResponse
    {
        Gate::authorize('delete', $client);
        $client->delete();

        return response()->json(null, 204);
    }
}
