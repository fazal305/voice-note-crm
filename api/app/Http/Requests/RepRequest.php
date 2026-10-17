<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class RepRequest extends FormRequest
{
    public function authorize(): Response|bool
    {
        $rep = $this->route('user');

        return $rep ? Gate::inspect('update', $rep) : Gate::inspect('create-rep');
    }

    public function rules(): array
    {
        $rep = $this->route('user');

        $rules = [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:190', Rule::unique('users', 'email')->ignore($rep?->id)],
        ];
        if (! $rep) {
            $rules['password'] = ['required', 'string', 'min:8', 'max:72'];
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'name.required' => "Enter the rep's name.",
            'email.required' => "Enter the rep's email address.",
            'email.email' => 'Enter a valid email address.',
            'email.unique' => 'This email is already in use.',
            'password.required' => 'Set a temporary password.',
            'password.min' => 'Use at least 8 characters.',
        ];
    }
}
