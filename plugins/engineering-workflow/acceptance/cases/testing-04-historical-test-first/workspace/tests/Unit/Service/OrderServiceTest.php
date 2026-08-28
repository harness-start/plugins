<?php

namespace Tests\Unit\Service;

use App\Service\OrderService;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(OrderService::class)]
final class OrderServiceTest extends TestCase
{
    public function test_creates_an_order(): void
    {
        $service = new OrderService();
        self::assertInstanceOf(OrderService::class, $service);
    }
}
