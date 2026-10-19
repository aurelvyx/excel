import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Access, type AuthRequest } from '../auth/access.js';
import { COOKIE_NAME } from '../auth/security.js';
import { inputDto } from '../../common/validation.js';
import { pageSchema } from '../../common/http-schema.js';
import { VouchersService, voucherRoles } from './vouchers.service.js';
import { VoucherDto, VoucherDecisionDto } from './vouchers.dto.js';
import { voucherSchema } from './vouchers.schema.js';
@Controller('vouchers')
@ApiTags('Vouchers — B07')
@ApiCookieAuth(COOKIE_NAME)
@Access(...voucherRoles)
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Requerido para escrituras',
})
export class VouchersController {
  constructor(
    @Inject(VouchersService) private readonly service: VouchersService,
  ) {}
  @Get()
  @ApiOkResponse({ schema: pageSchema(voucherSchema) })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'estudianteId', required: false })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: ['PENDIENTE', 'VALIDADO', 'RECHAZADO'],
  })
  @ApiQuery({ name: 'after', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@Req() req: AuthRequest, @Query() query: Record<string, unknown>) {
    return this.service.list(req.identity, query);
  }
  @Get(':id')
  @ApiOkResponse({ schema: voucherSchema })
  get(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.get(req.identity, id);
  }
  @Post()
  @ApiBody({ type: VoucherDto })
  @ApiCreatedResponse({ schema: voucherSchema })
  @ApiOperation({ summary: 'Registrar voucher pendiente; no activa matrícula' })
  create(@Req() req: AuthRequest, @Body(inputDto(VoucherDto)) dto: VoucherDto) {
    return this.service.create(req.identity, dto, req.ip);
  }
  @Patch(':id/decision')
  @ApiBody({ type: VoucherDecisionDto })
  @ApiOkResponse({ schema: voucherSchema })
  @ApiOperation({
    summary: 'Decidir un voucher pendiente una sola vez, con auditoría',
  })
  decide(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(inputDto(VoucherDecisionDto)) dto: VoucherDecisionDto,
  ) {
    return this.service.decide(req.identity, id, dto, req.ip);
  }
}
