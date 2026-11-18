import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuthorsService } from './authors.service.js';
import { AuthorPaginator, GetAuthorDto } from './dto/get-author.dto.js';
import { GetTopAuthorsDto } from './dto/get-top-authors.dto.js';
import { Author } from './entities/author.entity.js';
import { UpdateAuthorDto } from './dto/update-author.dto.js';
import { CreateAuthorDto } from './dto/create-author.dto.js';
import { Public } from '#src/auth/decorators/public.decorator.js';
import {
  ADMIN_AND_OWNER,
  ADMIN_ONLY,
  Permissions,
} from '#src/auth/decorators/permissions.decorator.js';

@Controller('authors')
export class AuthorsController {
  constructor(private readonly authorsService: AuthorsService) {}

  @Permissions(...ADMIN_AND_OWNER)
  @Post()
  createAuthor(@Body() createAuthorDto: CreateAuthorDto) {
    return this.authorsService.create(createAuthorDto);
  }

  @Public()
  @Get()
  async getAuthors(@Query() query: GetAuthorDto): Promise<AuthorPaginator> {
    return this.authorsService.getAuthors(query);
  }

  @Public()
  @Get(':slug')
  async getAuthorBySlug(@Param('slug') slug: string): Promise<Author> {
    return this.authorsService.getAuthorBySlug(slug);
  }

  @Permissions(...ADMIN_ONLY)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateAuthorDto: UpdateAuthorDto) {
    return this.authorsService.update(+id, updateAuthorDto);
  }

  @Permissions(...ADMIN_ONLY)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.authorsService.remove(+id);
  }
}

@Public()
@Controller('top-authors')
export class TopAuthors {
  constructor(private authorsService: AuthorsService) {}

  @Get()
  getTopAuthors(@Query() query: GetTopAuthorsDto): Promise<Author[]> {
    return this.authorsService.getTopAuthors(query);
  }
}
