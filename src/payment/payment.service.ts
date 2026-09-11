import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayPaymentDto } from './dto/pay-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number) {
    await this.markOverdue(userId);
    const items = await this.prisma.paymentReminder.findMany({
      where: { userId },
      orderBy: { dueDate: 'asc' },
    });
    return items.map((item) => this.serialize(item));
  }

  async create(userId: number, dto: CreatePaymentDto) {
    const item = await this.prisma.paymentReminder.create({
      data: {
        userId,
        title: dto.title,
        notes: dto.notes,
        category: dto.category,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        priority: dto.priority,
        recurrence: dto.recurrence,
        paymentMethod: dto.paymentMethod,
        receipt: dto.receipt,
      },
    });
    return this.serialize(item);
  }

  async update(userId: number, id: number, dto: UpdatePaymentDto) {
    await this.assertOwner(userId, id);
    const data: Prisma.PaymentReminderUpdateInput = {
      ...dto,
    };
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
    if (dto.paidAt !== undefined)
      data.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;
    const item = await this.prisma.paymentReminder.update({
      where: { id },
      data,
    });
    return this.serialize(item);
  }

  async remove(userId: number, id: number) {
    await this.assertOwner(userId, id);
    await this.prisma.paymentReminder.delete({ where: { id } });
  }

  async markPaid(userId: number, id: number, dto: PayPaymentDto) {
    await this.assertOwner(userId, id);
    const item = await this.prisma.paymentReminder.update({
      where: { id },
      data: {
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        paymentMethod: dto.paymentMethod,
        receipt: dto.receipt,
      },
    });
    return this.serialize(item);
  }

  async markPending(userId: number, id: number) {
    await this.assertOwner(userId, id);
    const item = await this.prisma.paymentReminder.update({
      where: { id },
      data: { status: PaymentStatus.PENDING, paidAt: null },
    });
    return this.serialize(item);
  }

  async summary(userId: number, month: string) {
    await this.markOverdue(userId);
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const items = await this.prisma.paymentReminder.findMany({
      where: { userId, dueDate: { gte: start, lt: end } },
    });
    const result = {
      totalPayments: items.length,
      paidCount: 0,
      pendingCount: 0,
      overdueCount: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      overdueAmount: 0,
    };
    for (const item of items) {
      const amount = Number(item.amount);
      result.totalAmount += amount;
      if (item.status === PaymentStatus.PAID) {
        result.paidCount++;
        result.paidAmount += amount;
      } else if (item.status === PaymentStatus.OVERDUE) {
        result.overdueCount++;
        result.overdueAmount += amount;
      } else if (item.status === PaymentStatus.PENDING) {
        result.pendingCount++;
        result.pendingAmount += amount;
      }
    }
    return { month, ...result };
  }

  private async markOverdue(userId: number) {
    await this.prisma.paymentReminder.updateMany({
      where: {
        userId,
        status: PaymentStatus.PENDING,
        dueDate: { lt: new Date() },
      },
      data: { status: PaymentStatus.OVERDUE },
    });
  }

  private async assertOwner(userId: number, id: number) {
    const item = await this.prisma.paymentReminder.findFirst({
      where: { id, userId },
    });
    if (!item) throw new NotFoundException('Lembrete não encontrado.');
  }

  private serialize(item: { amount: unknown; [key: string]: unknown }) {
    return { ...item, amount: Number(item.amount) };
  }
}
