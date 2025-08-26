// src/hooks/index.js
import * as auctionEventHooks from './AuctionEventHooks.js';
import * as systemFormsHooks from './SystemFormsHooks.js';
import * as articleHooks from './ArticleHooks.js';
import * as menuHooks from './MenuHooks.js';
import { TempIndexRead } from './TempIndexRead';





export const hooks = {
  'auction-event': auctionEventHooks,
  'systemforms': systemFormsHooks,
  'articles': articleHooks,
  'menus': menuHooks,
  'xyz': TempIndexRead,
};
