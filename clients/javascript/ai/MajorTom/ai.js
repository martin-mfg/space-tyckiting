"use strict";

var _ = require("lodash");
// this version of position.js imports typify and therefore doesn't crash when calling position.clamp
var position = require("../../../../server/server/position.js");

// Change botNames and teamName to your choice.
var botNames = [
  "Zero",
  "One",
  "Two"
];


/*
The basic logic of this AI is as follows:
 - if one of our bots has been seen, detected via radar, damaged or hit, move it by config.move fields in a random direction
 - if an enemy bot has been seen, detected via radar or hit, shoot a random position next to the enemy bot (assuming that the enemy might move)
 - otherwise, radar a random position but make sure that simultaneously radared areas do not overlap
*/

// maps the botId of every bot that shot last round to the position it shot at
var cannonTargets = [];

module.exports = function Ai() {
  function makeDecisions(roundId, events, bots, config) {
		// maps the botId of located enemy bots to their (approximate) positions
		var enemyPos = [];
		// maps the botId of our bots to their positions
		var ourPos = [];
		for(var i = 0; i < bots.length; i++) {
			if(bots[i].alive) {
				ourPos[bots[i].botId] = position.make(bots[i].x, bots[i].y);
			}
		}
		
		// an array that stores the botIds of our bots that already acted this round
		var actedBots = [];
		
		// an array containing the botIds of our bots
		var ourIds = [];
		for(var i = 0; i < bots.length; i++) {
			ourIds.push(bots[i].botId);
		}
		
		// react to the received events
		for(var i = 0; i < events.length; i++) {
			var curEvent = events[i];
			var bot = null;
			var pos = null;
			if(curEvent.botId !== null) {
				bot = _.find(bots, {'botId' : curEvent.botId});
				if(bot != undefined) {
					pos = position.make(bot.x, bot.y);
				}
			}

			switch(curEvent.event) {
				case "hit": 
					if(ourIds.indexOf(curEvent.botId) != -1) { // our bot was hit
						// move as far as possible, unless the bot was killed
						if(bot.alive && actedBots.indexOf(bot.botId) == -1) {
							var newPos = randomElement(neighbours(pos, config.move, config.move, config));
							bot.move(newPos.x, newPos.y);
							ourPos[bot.botId] = newPos;
							actedBots.push(bot.botId);
						}
					} else { // enemy was hit
						// add to enemyPos, unless the bot was killed
						if(_.find(events, {'event' : "die", 'botId' : curEvent.botId}) === undefined) {
							enemyPos[curEvent.botId] = cannonTargets[curEvent.source];
						}
					}
					break;
				case "die":
					// do nothing. These are handled before actually reacting to the other events
					break;
				case "see":
					// add to enemyPos, unless the bot was killed
					if(_.find(events, {'event' : "die", 'botId' : curEvent.botId}) === undefined) {
						enemyPos[curEvent.botId] = curEvent.pos;
					}
					// move as far as possible, unless the bot was killed
					// because if we saw the enemy, the enemy saw us, too
					var ownBot = _.find(bots, {'botId' : curEvent.source});
					if(ownBot.alive && actedBots.indexOf(ownBot.botId) == -1) {
						var newPos = randomElement(neighbours(position.make(ownBot.x, ownBot.y), config.move, config.move, config));
						ownBot.move(newPos.x, newPos.y);
						ourPos[ownBot.botId] = newPos;
						actedBots.push(ownBot.botId);
					}
				case "radarEcho":
						// add to enemyPos assuming that the bot wasn't killed already
						enemyPos[-1] = curEvent.pos;
					break;
				case "detected":
					// move as far as possible, unless the bot was killed
					if(bot.alive && actedBots.indexOf(bot.botId) == -1) {
						var newPos = randomElement(neighbours(pos, config.move, config.move, config));
						bot.move(newPos.x, newPos.y);
						ourPos[bot.botId] = newPos;
						actedBots.push(bot.botId);
					}
					break;
				case "damaged":
					// move as far as possible, unless the bot was killed
					if(bot.alive && actedBots.indexOf(bot.botId) == -1) {
						var newPos = randomElement(neighbours(pos, config.move, config.move, config));
						bot.move(newPos.x, newPos.y);
						ourPos[bot.botId] = newPos;
						actedBots.push(bot.botId);
					}
					break;
				case "move":
					// do nothing. We know our positions already.
					break;
				case "noaction":
				// do nothing. This should not happen.
					break;
				default:
					// do nothing
					break;
			}
		}
		
		// an array containing the positions we want to shoot at
		var targets = [];

		// add every position next to a spotted enemy to targets
		for(var index in enemyPos) {
			targets = targets.concat(neighbours(enemyPos[index], config.cannon, config.move - config.cannon, config));
		}
		
		// remove every position from targets that we can't shoot at without hurting one of our bots
		for(var index in ourPos) {
			var toRemove = neighbours(ourPos[index], 0, config.cannon, config);
			targets = targets.filter(function(arg){return _.find(toRemove, arg) === undefined;});
		}
		
		if(targets.length > 0) {
			// every bot that didn't act until now shoots a different random position from targets.
			cannonTargets = [];
			for(var i = 0; i < bots.length; i++) {
				if(bots[i].alive && actedBots.indexOf(bots[i].botId) == -1) {
					var targetIndex = randInt(0, targets.length - 1);
					var myTarget = targets[targetIndex];
					bots[i].cannon(myTarget.x, myTarget.y);
					cannonTargets[bots[i].botId] = myTarget;
					if(targets.length > 1) {
						targets.splice(targetIndex, 1);
					}
				}
			}
		} else {
			// every bot that didn't act until now radars a random cell.
			var radared = [];
			for(var i = 0; i < bots.length; i++) {
				if(bots[i].alive && actedBots.indexOf(bots[i].botId) == -1) {
					// not directly radaring cells on the edge of the game area makes detecting enemies there a little less likely,
					// but wastes less area of the radared circle.
					var myTarget = randomElement(neighbours(position.origo, 0, config.fieldRadius - 1, config));
					// if necessary, choose a new radar cell so that radared areas do not overlap
					while(multiDistance(radared, myTarget) <= config.radar * 2) {
						myTarget = randomElement(neighbours(position.origo, 0, config.fieldRadius - 1, config)); // see comment above
					}
					bots[i].radar(myTarget.x, myTarget.y);
					radared.push(myTarget);
				}
			}
		}
  }

  return {
    // The AI must return these three attributes
    botNames: botNames,
    makeDecisions: makeDecisions
  };
};


// points: an array of positions
// extraPoint: a position
// calculates the distance between extraPoint and every point in points and returns the minimum of these distances
function multiDistance(points, extraPoint) {
	var result = Number.MAX_SAFE_INTEGER;
	for(var i = 0; i < points.length; i++) {
		result = Math.min(result, position.distance(extraPoint, points[i]));
	}
	return result;
}

// pos: a position
// minDist: an integer
// maxDist: an integer
// config: the config object passed to makeDecisions
// returns an array of all positions that
//  - are inside the game area,
//  - have a distance of at least minDist to pos and
//  - have a distance of at most maxDist to pos
// note: if minDist is 0, the result includes the position pos
function neighbours(pos, minDist, maxDist, config) {
  var result = position.neighbours(pos, maxDist);
  for(var i = result.length - 1; i >= 0; i--) {
  	// remove result[i] if it's closer than minDist or it's outside the game area
  	if(position.distance(result[i], pos) < minDist || ! position.eq(position.clamp(result[i], config.fieldRadius), result[i])) {
  		result.splice(i, 1);
  	}
  }
  if(minDist <= 0) {
  	result.push(pos);
  }
  return result;
}

// input: an array
// returns a random element from input
function randomElement(input) {
	return input[randInt(0, input.length - 1)];
}

// min: an integer
// max: an integer
// returns a random integer from the interval [min, max] (inclusive)
function randInt(min, max) {
  var range = max - min;
  var rand = Math.floor(Math.random() * (range + 1));
  return min + rand;
}

