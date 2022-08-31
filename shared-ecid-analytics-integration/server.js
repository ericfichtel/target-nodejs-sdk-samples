/***************************************************************************************
 * (c) 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 ****************************************************************************************/

const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const Visitor = require("@adobe-mcid/visitor-js-server");
const uuidv4 = require("uuid/v4");
const TargetClient = require("@adobe/target-nodejs-sdk");
const CONFIG = {
  client: "adobetargetmobile",
  organizationId: "B8A054D958807F770A495DD6@AdobeOrg",
  timeout: 10000,
  logger: console
};
const targetClient = TargetClient.create(CONFIG);
const TEMPLATE = fs.readFileSync(__dirname + "/templates/index.tpl").toString();

const app = express();
app.use(cookieParser());
app.use(express.static(__dirname + "/public"));

function saveCookie(res, cookie) {
  if (!cookie) {
    return;
  }

  res.cookie(cookie.name, cookie.value, { maxAge: cookie.maxAge * 1000 });
}

const getResponseHeaders = () => ({
  "Content-Type": "text/html",
  Expires: new Date().toUTCString()
});

function sendHtml(res, offer) {
  const htmlResponse = TEMPLATE.replace(
    "${organizationId}",
    CONFIG.organizationId
  )
    .replace("${visitorState}", JSON.stringify(offer.visitorState))
    .replace("${content}", JSON.stringify(offer, null, " "));

  res.status(200).send(htmlResponse);
}

function sendSuccessResponse(res, response) {
  res.set(getResponseHeaders());
  saveCookie(res, response.targetCookie);
  sendHtml(res, response);
}

function sendErrorResponse(res, error) {
  res.set(getResponseHeaders());
  res.status(500).send(error);
}

function getAddress(req) {
  return { url: req.headers.host + req.originalUrl };
}

app.get("/", async (req, res) => {
  const visitorCookie =
    req.cookies[
      encodeURIComponent(
        TargetClient.getVisitorCookieName(CONFIG.organizationId)
      )
    ];
  const visitor = new Visitor(CONFIG.organizationId, visitorCookie);
  const sessionId = uuidv4();

  const targetCookie = req.cookies[TargetClient.TargetCookieName];
  const firstRequest = {
    execute: {
      mboxes: [
        {
          address: getAddress(req),
          name: "a1-serverside-ab"
        }
      ]
    }
  };
  const secondRequest = {
    execute: {
      mboxes: [
        {
          address: getAddress(req),
          name: "a1-serverside-ab"
        },
        {
          address: getAddress(req),
          name: "a1-serverside-xt"
        }
      ]
    }
  };

  try {
    const firstTargetRequest = targetClient.getOffers({
      request: firstRequest,
      targetCookie,
      sessionId,
      visitor,
      consumerId: "first"
    });
    const secondTargetRequest = targetClient.getOffers({
      request: secondRequest,
      targetCookie,
      sessionId,
      visitor,
      consumerId: "second"
    });
    const firstResponse = await firstTargetRequest;
    const secondResponse = await secondTargetRequest;
    const response = {
      firstOffer: firstResponse,
      secondOffer: secondResponse,
      targetCookie: secondResponse.targetCookie,
      visitorState: secondResponse.visitorState
    };
    sendSuccessResponse(res, response);
  } catch (error) {
    console.error("Target:", error);
    sendErrorResponse(res, error);
  }
});

app.listen(3000, function() {
  console.log("Listening on port 3000 and watching!");
});
