import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { validateBody } from "../../../lib/validation/validate.ts";
import { sendPaginated, sendSuccess } from "../../../lib/http/response.ts";
import {
  parseFilters,
  parsePaginationQuery,
} from "../../../lib/http/pagination/parse-query.ts";
import {
  CreateOrderRequestDTO,
  UpdateOrderStatusRequestDTO,
} from "../dto/order.request.dto.ts";
import {
  OrderDetailResponseDTO,
  OrderResponseDTO,
  OrderStatusResponseDTO,
  OrderSummaryResponseDTO,
} from "../dto/order.response.dto.ts";
import { OrderService } from "../service/order.service.ts";
import { OrderStatus } from "../enums.ts";
import { DeliveryService } from "../../delivery/service/delivery.service.ts";
import {
  RegionNotResolvedError,
  UnAuthorizedError,
} from "../../../lib/auth/errors.ts";
import { AppError } from "../../../lib/error/AppError.ts";

const ORDER_SORT_FIELDS = ["created_at"];
const ORDER_FILTER_FIELDS = ["status", "created_at"];

@injectable()
export class OrderController {
  constructor(
    @inject(TOKENS.OrderService) private readonly orderService: OrderService,
    @inject(TOKENS.DeliveryService)
    private readonly deliveryService: DeliveryService,
  ) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "customer") throw UnAuthorizedError;
      const data = await validateBody(CreateOrderRequestDTO, req.body);
      const { order, items, branchLabel, restaurantName } =
        await this.orderService.placeOrder(req.user!.userId, data);
      sendSuccess(
        res,
        OrderResponseDTO.from(order, items, branchLabel, restaurantName),
        201,
      );
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const { order, items, branchLabel, restaurantName } =
        await this.orderService.getOrder(
          String(req.params.publicId),
          req.region,
          req.user!,
        );
      sendSuccess(
        res,
        OrderDetailResponseDTO.fromDetail(
          order,
          items,
          branchLabel,
          restaurantName,
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  listCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "customer") throw UnAuthorizedError;
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const year = req.query.year
        ? Number(req.query.year)
        : new Date().getFullYear();
      const pagination = parsePaginationQuery(req.query, {
        allowedSortFields: ORDER_SORT_FIELDS,
        defaultSortBy: "created_at",
      });
      const { data, meta } = await this.orderService.listCustomerOrders(
        req.user!.userId,
        req.region,
        year,
        pagination,
      );
      sendPaginated(
        res,
        data.map(({ order, itemsCount, restaurantName }) =>
          OrderSummaryResponseDTO.from(order, itemsCount, restaurantName),
        ),
        meta,
      );
    } catch (err) {
      next(err);
    }
  };

  listRestaurant = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const branchId = Number(req.query.branchId);
      if (!branchId) {
        throw new AppError("branchId query param is required", 400);
      }
      const pagination = parsePaginationQuery(req.query, {
        allowedSortFields: ORDER_SORT_FIELDS,
        defaultSortBy: "created_at",
      });
      const filters = parseFilters(req.query, ORDER_FILTER_FIELDS);
      const { data, meta } = await this.orderService.listRestaurantOrders(
        branchId,
        req.region,
        filters,
        pagination,
        req.user!,
      );
      sendPaginated(
        res,
        data.map(({ order, itemsCount, restaurantName }) =>
          OrderSummaryResponseDTO.from(order, itemsCount, restaurantName),
        ),
        meta,
      );
    } catch (err) {
      next(err);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const data = await validateBody(UpdateOrderStatusRequestDTO, req.body);
      const updated = await this.orderService.updateStatus(
        String(req.params.publicId),
        req.region,
        data.status,
        req.user!,
        data.reason,
      );

      if (data.status === OrderStatus.READY) {
        // Best-effort auto-assignment — a failure here must not fail the
        // status update the client is waiting on.
        this.deliveryService
          .tryAutoAssign(updated.id, req.region)
          .catch(() => {});
      }

      sendSuccess(res, OrderStatusResponseDTO.from(updated));
    } catch (err) {
      next(err);
    }
  };
}
