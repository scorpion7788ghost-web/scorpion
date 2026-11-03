<?php

namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * A basic test example.
     */
    public function test_the_application_returns_a_successful_response(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('Selected work');
        $response->assertSee('Sample concept');
        $response->assertSee('Your contact details are coming soon.');
        $response->assertDontSee('mailto:');
    }

    public function test_contact_link_uses_the_configured_email(): void
    {
        config(['portfolio.email' => 'hello@example.com', 'portfolio.name' => 'Alex Example']);

        $this->get('/')
            ->assertOk()
            ->assertSee('Alex Example')
            ->assertSee('mailto:hello@example.com', false)
            ->assertDontSee('Your contact details are coming soon.');
    }
}
