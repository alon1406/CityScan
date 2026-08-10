import { HazardRepository } from './repositories/hazard.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { LogRepository } from './repositories/log.repository.js';

import { UserConverter } from './converters/user.converter.js';
import { HazardConverter } from './converters/hazard.converter.js';
import { LogConverter } from './converters/log.converter.js';

import { HazardsServiceImpl } from './logic/impl/hazards.service.impl.js';
import { AuthServiceImpl } from './logic/impl/auth.service.impl.js';
import { UsersServiceImpl } from './logic/impl/users.service.impl.js';
import { LogsServiceImpl } from './logic/impl/logs.service.impl.js';
import { GeminiAiServiceImpl } from './logic/impl/gemini.ai.service.impl.js';
import { LocalDiskPhotoStorageImpl } from './logic/impl/localDisk.photoStorage.impl.js';
import { EmitterEventsServiceImpl } from './logic/impl/emitter.events.service.impl.js';
import { DemoServiceImpl } from './logic/impl/demo.service.impl.js';

import { HazardController } from './controllers/hazard.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { UserController } from './controllers/user.controller.js';
import { LogController } from './controllers/log.controller.js';
import { DemoController } from './controllers/demo.controller.js';

import type { AiService } from './logic/ai.service.js';
import type { EventsService } from './logic/events.service.js';
import type { AuthService } from './logic/auth.service.js';
import type { DemoService } from './logic/demo.service.js';

/**
 * Composition root.
 *
 * Spring builds this graph from `@Service`/`@Component` annotations and injects through
 * constructors. Without a framework the same wiring is done here, once, explicitly —
 * which has the side benefit that the entire dependency graph is readable in one file.
 *
 * Everything above depends on interfaces from `logic/`, so swapping an implementation
 * is a change to this file only. The Phase 3 plan to move from Gemini to Groq is one
 * line here: `const ai = new GroqAiServiceImpl()`.
 */
export interface Container {
  ai: AiService;
  events: EventsService;
  auth: AuthService;
  demo: DemoService;
  controllers: {
    hazard: HazardController;
    auth: AuthController;
    user: UserController;
    log: LogController;
    demo: DemoController;
  };
}

export function createContainer(): Container {
  // --- Repositories ---
  const hazardRepository = new HazardRepository();
  const userRepository = new UserRepository();
  const logRepository = new LogRepository();

  // --- Converters ---
  const userConverter = new UserConverter();
  const hazardConverter = new HazardConverter(userConverter);
  const logConverter = new LogConverter();

  // --- Infrastructure services ---
  const ai = new GeminiAiServiceImpl();
  const photos = new LocalDiskPhotoStorageImpl();
  const events = new EmitterEventsServiceImpl();

  // --- Business services ---
  const hazardsService = new HazardsServiceImpl(
    hazardRepository,
    hazardConverter,
    ai,
    photos,
    events
  );
  const authService = new AuthServiceImpl(userRepository, userConverter);
  const usersService = new UsersServiceImpl(userRepository, userConverter);
  const logsService = new LogsServiceImpl(logRepository, logConverter);
  const demoService = new DemoServiceImpl(photos, events);

  return {
    ai,
    events,
    auth: authService,
    demo: demoService,
    controllers: {
      hazard: new HazardController(hazardsService, events),
      auth: new AuthController(authService),
      user: new UserController(usersService),
      log: new LogController(logsService),
      demo: new DemoController(demoService),
    },
  };
}
