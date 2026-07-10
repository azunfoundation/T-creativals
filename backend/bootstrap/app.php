<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Token-based auth via Bearer tokens (localStorage) — statefulApi() not needed
        // Trust all proxies on Oracle Cloud (Apache reverse proxy)
        $middleware->trustProxies(at: '*');
        // Ensure JSON bodies are merged under Apache mod_php — prepend to run first
        $middleware->prepend(\App\Http\Middleware\ParseJsonBody::class);
        // Also attach to the 'api' middleware group as a safety net
        $middleware->appendToGroup('api', \App\Http\Middleware\ParseJsonBody::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // Never leak raw SQL/database errors to API clients. Full details are
        // still reported to the log for debugging.
        $exceptions->render(function (\Illuminate\Database\QueryException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null; // fall through to default rendering
            }

            report($e);

            $sqlState = $e->errorInfo[0] ?? null;
            $isUniqueViolation = $sqlState === '23000'
                || str_contains($e->getMessage(), 'UNIQUE constraint failed');

            if ($isUniqueViolation) {
                return response()->json([
                    'message' => 'This record conflicts with an existing one (a unique field such as email or employee ID is already in use).',
                ], 409);
            }

            return response()->json([
                'message' => 'A database error occurred. Please try again or contact your administrator.',
            ], 500);
        });
    })->create();
