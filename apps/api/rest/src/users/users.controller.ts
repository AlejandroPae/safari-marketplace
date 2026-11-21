import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  Logger,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { oneLine } from '#src/common/logging.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { GetUsersDto } from './dto/get-users.dto.js';
import {
  ADMIN_ONLY,
  Permissions,
} from '#src/auth/decorators/permissions.decorator.js';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '#src/auth/decorators/current-user.decorator.js';

// Plataforma: gestión de usuarios es ADMIN_ONLY.
@Permissions(...ADMIN_ONLY)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  getAllUsers(@Query() query: GetUsersDto) {
    return this.usersService.getUsers(query);
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Put(':id')
  updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  removeUser(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }

  @Post('unblock-user')
  activeUser(@Body('id') id: number) {
    return this.usersService.activeUser(+id);
  }

  @Post('block-user')
  banUser(
    @Body('id') id: number,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.usersService.banUser(+id, currentUser);
  }

  // La ruta no declara `:user_id` como path param — `@Param('user_id')`
  // era siempre `undefined`. El admin lo manda en el body
  // (`apps/admin/rest/src/types/index.ts:442-444`), no en la ruta.
  @Post('make-admin')
  makeAdmin(@Body('user_id') userId: string) {
    return this.usersService.makeAdmin(userId);
  }
}

// Solo admin, como el resto de grupos de usuarios: sin token ⇒ 401;
// `customer` ⇒ 403.
@Permissions(...ADMIN_ONLY)
@Controller('profiles')
export class ProfilesController {
  private readonly logger = new Logger(ProfilesController.name);

  constructor(private readonly usersService: UsersService) {}

  @Post()
  // Stub; nunca el cuerpo (contacto, bio, redes: datos personales).
  createProfile(@Body() _createProfileDto: CreateProfileDto) {
    this.logger.warn('POST /profiles es un stub: no guarda nada');
  }

  @Put(':id')
  updateProfile(
    @Param('id') id: string,
    @Body() _updateProfileDto: UpdateProfileDto,
  ) {
    this.logger.warn(`PUT /profiles/${oneLine(id)} es un stub: no guarda nada`);
  }

  @Delete(':id')
  deleteProfile(@Param('id') id: number) {
    return this.usersService.remove(id);
  }
}

@Permissions(...ADMIN_ONLY)
@Controller('admin/list')
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAllAdmin(@Query() query: GetUsersDto) {
    return this.usersService.getAdmin(query);
  }
}

@Permissions(...ADMIN_ONLY)
@Controller('vendors/list')
export class VendorController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAllVendor(@Query() query: GetUsersDto) {
    return this.usersService.getVendors(query);
  }
}

@Permissions(...ADMIN_ONLY)
@Controller('my-staffs')
export class MyStaffsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAllMyStaffs(
    @Query() query: GetUsersDto,
    @Query('shop_id') shopId: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.usersService.getMyStaffs(query, user, shopId);
  }
}
@Permissions(...ADMIN_ONLY)
@Controller('all-staffs')
export class AllStaffsController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAllStaffs(@Query() query: GetUsersDto) {
    return this.usersService.getAllStaffs(query);
  }
}

@Permissions(...ADMIN_ONLY)
@Controller('customers/list')
export class AllCustomerController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAllCustomers(@Query() query: GetUsersDto) {
    return this.usersService.getAllCustomers(query);
  }
}
