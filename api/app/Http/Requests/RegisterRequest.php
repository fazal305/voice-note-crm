<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'organization' => ['required', 'string', 'max:120'],
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'max:72'],
            'age_confirmed' => ['accepted'],
            'terms_accepted' => ['accepted'],
        ];
    }

    public function messages(): array
    {
        return [
            'organization.required' => 'Enter your team or company name.',
            'name.required' => 'Enter your name.',
            'email.required' => 'Enter your email address.',
            'email.email' => 'Enter a valid email address.',
            'email.unique' => "We couldn't create an account with this email.",
            'password.required' => 'Choose a password.',
            'password.min' => 'Use at least 8 characters.',
            'age_confirmed.accepted' => 'You must be 18 or older to use Voice Note CRM.',
            'terms_accepted.accepted' => 'Please accept the terms to continue.',
        ];
    }
}
