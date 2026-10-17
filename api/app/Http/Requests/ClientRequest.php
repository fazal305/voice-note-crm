<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class ClientRequest extends FormRequest
{
    // On update this authorizes before validating, so another organization's client is a 404 rather than a 422.
    public function authorize(): Response|bool
    {
        $client = $this->route('client');

        return $client ? Gate::inspect('update', $client) : true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'company' => ['nullable', 'string', 'max:120'],
            'email' => ['nullable', 'string', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:40', 'regex:/^[0-9+()\-.\s]*$/'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => "Enter the client's name.",
            'email.email' => 'Enter a valid email address.',
            'phone.regex' => 'Use digits, spaces and + ( ) - . only.',
        ];
    }
}
