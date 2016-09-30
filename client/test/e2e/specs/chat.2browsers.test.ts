/// <reference path="../test-types.ts"/>
/// <reference path="../../../../modules/definitely-typed/lodash/lodash.d.ts"/>
/// <reference path="../../../../modules/definitely-typed/mocha/mocha.d.ts"/>

import * as _ from 'lodash';
import server = require('../utils/server');
import utils = require('../utils/utils');
import pagesFor = require('../utils/pages-for');
import settings = require('../utils/settings');
import make = require('../utils/make');
import logAndDie = require('../utils/log-and-die');
var logUnusual = logAndDie.logUnusual, die = logAndDie.die, dieIf = logAndDie.dieIf;
var logMessage = logAndDie.logMessage;

declare var browser: any;
declare var browserA: any;
declare var browserB: any;

var everyone;
var owen;
var maria;


describe('chat', function() {

  it('create site with two members', function() {
    everyone = browser;
    owen = _.assign(browserA, pagesFor(browserA), make.memberOwenOwner());
    maria = _.assign(browserB, pagesFor(browserB), make.memberMaria());

    var site: SiteData = make.emptySiteOwnedByOwen();
    site.meta.localHostname = 'chat-' + Date.now();

    site.members.push(make.memberMaria());

    // Dupl test code below [6FKR4D0]
    var rootCategoryId = 1;

    var forumPage = make.page({
      id: 'fmp',
      role: <PageRole> 7,  // [commonjs] PageRole.Forum
      categoryId: rootCategoryId,
      authorId: 1,    // [commonjs] SystemUserId
    });
    site.pages.push(forumPage);

    site.pagePaths.push({ folder: '/', pageId: forumPage.id, showId: false, slug: '' });

    site.posts.push(make.post({
      page: forumPage,
      nr: 0,
      approvedSource: "Forum Title",
      approvedHtmlSanitized: "Forum Title",
    }));

    site.posts.push(make.post({
      page: forumPage,
      nr: 1,
      approvedSource: "Forum intro text.",
      approvedHtmlSanitized: "<p>Forum intro text.</p>",
    }));

    var rootCategory = make.rootCategoryWithIdFor(rootCategoryId, forumPage);
    rootCategory.defaultCategoryId = 2;
    site.categories.push(rootCategory);

    var uncategorizedCategory = make.categoryWithIdFor(2, forumPage);
    uncategorizedCategory.parentId = rootCategory.id;
    uncategorizedCategory.name = "Uncatigorized";
    uncategorizedCategory.slug = "uncatigorized";
    uncategorizedCategory.description = "The uncategorized category";
    site.categories.push(uncategorizedCategory);

    var idAddress = server.importSiteData(site);
    everyone.go(idAddress.siteIdOrigin);
  });

  it("Owen logs in, creates a chat topic", function() {
    owen.waitAndClick('#e2eCreateChatB');
    owen.loginDialog.loginWithPassword(owen);
    owen.waitAndSetValue('.esEdtr_titleEtc_title', "Chat channel title");
    owen.setValue('textarea', "Chat channel purpose");
    owen.rememberCurrentUrl();
    owen.waitAndClick('.e2eSaveBtn');
    owen.waitForNewUrl();
    owen.waitAndClick('#theJoinChatB');
  });

  it("Owen writes a chat message", function() {
    owen.chat.addChatMessage("Hi, I'm Owen, and my name is Owen.");
    owen.chat.waitForNumMessages(1);
    owen.assertTextMatches('.esC_M', /Owen/);
  });

  it("Maria opens the chat page, sees Owens message", function() {
    maria.go(owen.url().value);
    maria.chat.waitForNumMessages(1);
    maria.assertTextMatches('.esC_M', /Owen/);
  });

  it("Maria joins the chat topic", function() {
    maria.waitAndClick('#theJoinChatB');
    maria.loginDialog.loginWithPassword(maria);
  });

  it("Maria posts a chat message, and sees it", function() {
    maria.chat.addChatMessage("Hi, I'm Maria.");
    maria.chat.waitForNumMessages(2);
    maria.assertNthTextMatches('.esC_M', 2, /Maria/);
  });

  it("Owen sees it", function() {
    owen.chat.waitForNumMessages(2);
    owen.assertNthTextMatches('.esC_M', 2, /Maria/);
  });

  it("Owen posts a chat message, and sees it", function() {
    owen.chat.addChatMessage("Hi, and is your name Maria?");
    owen.assertNthTextMatches('.esC_M', 3, /is your name/);
  });

  it("Maria sees it", function() {
    maria.assertNthTextMatches('.esC_M', 3, /is your name/);
  });

  it("Done?", function() {
    everyone.perhapsDebug();
  });
});

