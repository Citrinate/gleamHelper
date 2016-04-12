// ==UserScript==
// @name Gleam.helper
// @namespace https://github.com/Citrinate/gleamHelper
// @description Enhances Gleam.io giveaways
// @author Citrinate
// @version 1.1.2
// @match http://gleam.io/*
// @match https://gleam.io/*
// @connect steamcommunity.com
// @connect twitter.com
// @grant GM_addStyle
// @grant GM_xmlhttpRequest
// @grant unsafeWindow
// @updateURL https://raw.githubusercontent.com/Citrinate/gleamHelper/master/gleamHelper.user.js
// @downloadURL https://raw.githubusercontent.com/Citrinate/gleamHelper/master/gleamHelper.user.js
// @require https://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js
// @run-at document-end
// ==/UserScript==

(function() {
	/**
	 *
	 */
	var gleamHelper = (function() {
		var gleam = null;

		/**
		 * Decide what to do for each of the entries
		 */
		function handleEntries() {
			var entries = $(".entry-method");

			for(var i = 0; i < entries.length; i++) {
				var entry_element = entries[i],
					entry = unsafeWindow.angular.element(entry_element).scope();

				switch(entry.entry_method.entry_type) {
					case "steam_join_group":
						loadSteamHandler.getInstance().handleEntry(entry, entry_element);
						break;

					case "twitter_follow":
					case "twitter_retweet":
					case "twitter_tweet":
						loadTwitterHandler.getInstance().handleEntry(entry, entry_element);
						break;

					default:
						break;
				}
			}
		}

		/**
		 * Handles Steam group buttons
		 */
		var loadSteamHandler = (function() {
			function init() {
				var steam_id = null,
					session_id = null,
					process_url = null,
					active_groups = [],
					button_base_id = "steam_button_",
					ready = false;

				// Get all the user data we'll need to make join/leave group requests
				GM_xmlhttpRequest({
					url: "https://steamcommunity.com/my/groups",
					method: "POST",
					onload: function(response) {
						steam_id = response.responseText.match(/g_steamID = \"(.+?)\";/);
						session_id = response.responseText.match(/g_sessionID = \"(.+?)\";/);
						process_url = response.responseText.match(/processURL = '(.+?)';/);
						steam_id = steam_id === null ? null : steam_id[1];
						session_id = session_id === null ? null : session_id[1];
						process_url = process_url === null ? null : process_url[1];

						$(response.responseText).find("a[href^='https://steamcommunity.com/groups/']").each(function() {
							var group_name = $(this).attr("href").replace("https://steamcommunity.com/groups/", "").toLowerCase();

							if(group_name.indexOf("/") == -1) {
								active_groups.push(group_name);
							}
						});

						$.unique(active_groups);
						ready = true;
					}
				});


				/**
				 * Add a join/leave toggle button to the entry
				 */
				function createButton(entry, entry_element) {
					if(steam_id === null || session_id === null || process_url === null) {
						// We're not logged in, try to mark it anyway incase we're already a member of the group
						markEntryCompleted(entry);
						gleamHelperUI.showError('You must be logged into <a href="https://steamcommunity.com" style="color: #fff" target="_blank">steamcommunity.com</a>');
					} else if(active_groups === null) {
						// Couldn't get user's group data
						markEntryCompleted(entry);
						gleamHelperUI.showError("Unable to determine what Steam groups you're a member of");
					} else {
						var group_name = entry.entry_method.config3.toLowerCase(),
							group_id = entry.entry_method.config4,
							starting_label = active_groups.indexOf(group_name) == -1 ? "Join Group" : "Leave Group",
							button_id = button_base_id + entry.entry_method.id;

						gleamHelperUI.addButton(button_id, entry_element, starting_label, function() {
							toggleGroupStatus(button_id, group_name, group_id);
							gleamHelperUI.showButtonLoading(button_id);
						});
					}
				}


				/**
				 * Toggle group status between "joined" and "left"
				 */
				function toggleGroupStatus(button_id, group_name, group_id) {
					if(active_groups.indexOf(group_name) == -1) {
						joinSteamGroup(group_name, group_id, function() {
							active_groups.push(group_name);
							gleamHelperUI.setButtonLabel(button_id, "Leave Group");
							gleamHelperUI.hideButtonLoading(button_id);
						});
					} else {
						leaveSteamGroup(group_name, group_id, function() {
							active_groups.splice(active_groups.indexOf(group_name), 1);
							gleamHelperUI.setButtonLabel(button_id, "Join Group");
							gleamHelperUI.hideButtonLoading(button_id);
						});
					}
				}

				/**
				 * Join a steam group
				 */
				function joinSteamGroup(group_name, group_id, callback) {
					GM_xmlhttpRequest({
						url: "https://steamcommunity.com/groups/" + group_name,
						method: "POST",
						headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
						data: $.param({ action: "join", sessionID: session_id }),
						onload: function(response) {
							if(typeof callback == "function") {
								callback();
							}
						}
					});
				}

				/**
				 * Leave a steam group
				 */
				function leaveSteamGroup(group_name, group_id, callback) {
					GM_xmlhttpRequest({
						url: process_url,
						method: "POST",
						headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
						data: $.param({ sessionID: session_id, action: "leaveGroup", groupId: group_id }),
						onload: function(response) {
							if(typeof callback == "function") {
								callback();
							}
						}
					});
				}

				return {
					/**
					 *
					 */
					handleEntry: function(entry, entry_element) {
						if(ready) {
							createButton(entry, entry_element);
						} else {
							// Wait for the command hub to load
							var temp_interval = setInterval(function() {
								if(ready) {
									clearInterval(temp_interval);
									createButton(entry, entry_element);
								}
							}, 500);
						}
					}
				};
			}

			var instance;
			return {
				getInstance: function() {
					if(!instance) instance = init();
					return instance;
				}
			};
		})();

		/**
		 * Handles Twitter undo buttons
		 */
		var loadTwitterHandler = (function() {
			function init() {
				var auth_token = null,
					user_handle = null,
					deleted_tweets = [], // used to make sure we dont try to delete the same (re)tweet more than once
					button_base_id = "twitter_button_",
					ready = false;

				// Get all the user data we'll need to undo twitter entries
				GM_xmlhttpRequest({
					url: "https://twitter.com",
					method: "GET",
					onload: function(response) {
						auth_token = $($(response.responseText).find("input[id='authenticity_token']").get(0)).attr("value");
						user_handle = $(response.responseText).find(".account-group.js-mini-current-user").attr("data-screen-name");
						auth_token = typeof auth_token == "undefined" ? null : auth_token;
						user_handle = typeof user_handle == "undefined" ? null : user_handle;
						ready = true;
					}
				});

				/**
				 * Get ready to create an item
				 */
				function prepCreateButton(entry, entry_element) {
					/* Wait until the entry is completed before showing the button,
					and only show a button for entries that start out as uncompleted */
					if(gleam.canEnter(entry.entry_method) || entry.requiresMandatoryActions()) {
						var start_time = +new Date();

						var temp_interval = setInterval(function() {
							if(!(gleam.canEnter(entry.entry_method) || entry.requiresMandatoryActions())) {
								clearInterval(temp_interval);
								createButton(entry_element, entry, start_time, +new Date());
							}
						}, 500);
					}
				}

				/**
				 * Create the button
				 */
				function createButton(entry_element, entry, start_time, end_time) {
					if(auth_token === null || user_handle === null) {
						gleamHelperUI.showError('You must be logged into <a href="https://twitter.com" style="color: #fff" target="_blank">twitter.com</a>');
					} else {
						var button_id = button_base_id + entry.entry_method.id;

						if(entry.entry_method.entry_type == "twitter_follow") {
							// Unfollow button
							var twitter_handle = entry.entry_method.config1;

							gleamHelperUI.addButton(button_id, entry_element, "Unfollow", function() {
								gleamHelperUI.removeButton(button_id);

								// Get user's Twitter ID
								getTwitterUserData(twitter_handle, function(twitter_id, is_following) {
									deleteTwitterFollow(twitter_handle, twitter_id);
								});
							});
						} else if(entry.entry_method.entry_type == "twitter_retweet") {
							// Delete Retweet button
							gleamHelperUI.addButton(button_id, entry_element, "Delete Retweet", function() {
								gleamHelperUI.removeButton(button_id);
								deleteTwitterTweet(true, entry.entry_method.config1.match(/\/([0-9]+)/)[1]);
							});
						} else if(entry.entry_method.entry_type == "twitter_tweet") {
							// Delete Tweet button
							gleamHelperUI.addButton(button_id, entry_element, "Delete Tweet", function() {
								gleamHelperUI.removeButton(button_id);

								/* We don't have an id for the tweet, so instead delete the first tweet we can find
								that was posted after we handled the entry, but before it was marked completed.

								Tweets are instantly posted to our profile, but there's a delay before they're made
								public (a few seconds).  Increase the range by a few seconds to compensate. */
								getTwitterTweet(start_time, end_time + 60 * 1000, function(tweet_id) {
									if(tweet_id === false) {
										gleamHelperUI.showError('Failed to find <a href="https://twitter.com/' + user_handle + '" style="color: #fff" target="_blank">Tweet</a>');
									} else {
										deleteTwitterTweet(false, tweet_id);
									}
								});
							});
						}
					}
				}

				/**
				 * @return {String} twitter_id - Twitter id for this handle
				 * @return {Boolean} is_following - True for "following", false for "not following"
				 */
				function getTwitterUserData(twitter_handle, callback) {
					GM_xmlhttpRequest({
						url: "https://twitter.com/" + twitter_handle,
						method: "GET",
						onload: function(response) {
							var twitter_id = $($(response.responseText.toLowerCase()).find("[data-screen-name='" + twitter_handle.toLowerCase() + "'][data-user-id]").get(0)).attr("data-user-id"),
								is_following = $($(response.responseText.toLowerCase()).find("[data-screen-name='" + twitter_handle.toLowerCase() + "'][data-you-follow]").get(0)).attr("data-you-follow");

							if(typeof twitter_id !== "undefined" && typeof is_following !== "undefined") {
								callback(twitter_id, is_following !== "false");
							} else {
								callback(null, null);
							}
						}
					});
				}

				/**
				 * Unfollow a twitter user
				 */
				function deleteTwitterFollow(twitter_handle, twitter_id) {
					if(twitter_id === null) {
						gleamHelperUI.showError('Failed to unfollow Twitter user: <a href="https://twitter.com/' + twitter_handle + '" style="color: #fff" target="_blank">' + twitter_handle + '</a>');
					} else {
						GM_xmlhttpRequest({
							url: "https://twitter.com/i/user/unfollow",
							method: "POST",
							headers: { "Origin": "https://twitter.com", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
							data: $.param({ authenticity_token: auth_token, user_id: twitter_id }),
							onload: function(response) {
								if(response.status != 200) {
									console.log(twitter_handle, twitter_id, response);
									gleamHelperUI.showError('Failed to unfollow Twitter user: <a href="https://twitter.com/' + twitter_handle + '" style="color: #fff" target="_blank">' + twitter_handle + '</a>');
								}
							}
						});
					}
				}

				/**
				 * @param {Number} start_time - Unix timestamp in ms
				 * @param {Number} end_time - Unix timestamp in ms
				 * @return {Array|Boolean} tweet_id - The oldest (re)tweet id between start_time and end_time, false if none found
				 */
				function getTwitterTweet(start_time, end_time, callback) {
					GM_xmlhttpRequest({
						url: "https://twitter.com/" + user_handle,
						method: "GET",
						onload: function(response) {
							var found_tweet = false,
								now = +new Date();

							// reverse the order so that we're looking at oldest to newest
							$($(response.responseText.toLowerCase()).find("a[href*='" + user_handle.toLowerCase() + "/status/']").get().reverse()).each(function() {
								var tweet_time = $(this).find("span").attr("data-time-ms"),
									tweet_id = $(this).attr("href").match(/\/([0-9]+)/);

								if(typeof tweet_time != "undefined" && tweet_id !== null) {
									if(deleted_tweets.indexOf(tweet_id[1]) == -1 && tweet_time > start_time && (tweet_time < end_time || tweet_time > now)) {
										// return the first match
										found_tweet = true;
										deleted_tweets.push(tweet_id[1]);
										callback(tweet_id[1]);
										return false;
									}
								}
							});

							// couldn't find any tweets between the two times
							if(!found_tweet) {
								callback(false);
							}
						}
					});
				}

				/**
				 * Delete tweet
				 * @param {Boolean} retweet - True if we're dealing with a retweet, false for a tweet
				 * @param {Array} tweet_id - A single  (re)tweet ID
				 */
				function deleteTwitterTweet(retweet, tweet_id) {
					GM_xmlhttpRequest({
						url: retweet ? "https://twitter.com/i/tweet/unretweet" : "https://twitter.com/i/tweet/destroy",
						method: "POST",
						headers: { "Origin": "https://twitter.com", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
						data: $.param({ _method: "DELETE", authenticity_token: auth_token, id: tweet_id }),
						onload: function(response) {
							if(response.status != 200) {
								console.log(retweet, tweet_id, response);
								gleamHelperUI.showError('Failed to delete <a href="https://twitter.com/' + user_handle + '" style="color: #fff" target="_blank">' + (retweet ? "Retweet" : "Tweet") + '</a>');
							}
						}
					});
				}

				return {
					/**
					 *
					 */
					handleEntry: function(entry, entry_element) {
						if(ready) {
							prepCreateButton(entry, entry_element);
						} else {
							// Wait for the command hub to load
							var temp_interval = setInterval(function() {
								if(ready) {
									clearInterval(temp_interval);
									prepCreateButton(entry, entry_element);
								}
							}, 500);
						}
					}
				};
			}

			var instance;
			return {
				getInstance: function() {
					if(!instance) instance = init();
					return instance;
				}
			};
		})();

		return {
			/**
			 *
			 */
			initGleam: function() {
				// wait for gleam to finish loading
				var temp_interval = setInterval(function() {
					if($(".popup-blocks-container") !== null) {
						clearInterval(temp_interval);
						gleam = unsafeWindow.angular.element($(".popup-blocks-container").get(0)).scope();

						// wait for gleam to fully finish loading
						var another_temp_interval = setInterval(function() {
							if(typeof gleam.campaign.entry_count !== "undefined") {
								clearInterval(another_temp_interval);
								gleamHelperUI.loadUI();

								if(!gleam.showPromotionEnded()) {
									handleEntries();
								}
							}
						}, 500);
					}
				}, 500);
			},

			/**
			 * @return {Number} quantity - # of rewards being given away
			 */
			getQuantity: function() {
				return gleam.incentives[0].quantity;
			},

			/**
			 * @return {Boolean|Number} remaining - Estimated # of remaining rewards, false if not an instant-win giveaway
			 */
			getRemainingQuantity: function(callback) {
				if(gleam.campaign.campaign_type == "Reward") {
					/* Gleam doesn't report how many rewards have been distributed.  They only report how many entries have been
					completed, and how many entries are required for a reward.  Some users may only complete a few entries, not enough
					for them to get a reward, and so this is only an estimate, but we can say there's at least this many left. */
					var est_remaining = gleam.incentives[0].quantity - Math.floor(gleam.campaign.entry_count / gleam.incentives[0].actions_required);

					return Math.max(0, est_remaining);
				}

				return false;
			},

			/**
			 * @return {Number} chance - Estimated probability of winning a raffle rounded to 2 decimal places
			 */
			calcWinChance: function() {
				var your_entries = gleam.contestantEntries(),
					total_entries = gleam.campaign.entry_count,
					num_rewards = gleam.incentives[0].quantity;

				return Math.round(10000 * (1 - Math.pow((total_entries - your_entries) / total_entries, num_rewards))) / 100;
			}
		};
	})();

	var gleamHelperUI = (function() {
		var active_errors = [],
			active_notifications = {},
			active_buttons = {},
			win_chance_container = $("<span>", { class: "gh__win_chance" }),
			gleam_helper_container = $("<div>", { class: "gh__main_container" });

			GM_addStyle(
				".gh__main_container { font-size: 16.5px; left: 0px; position: fixed; top: 0px; width: 100%; z-index: 9999999999; }" +
				".gh__button { bottom: 0px; height: 20px; margin: auto; padding: 6px; position: absolute; right: 64px; top: 0px; z-index: 9999999999; }" +
				".gh__notification { background: #000; border-top: 1px solid rgba(52, 152, 219, .5); box-shadow: 0px 2px 10px rgba(0, 0, 0, .5); box-sizing: border-box; color: #3498db; padding: 12px; width: 100%; }" +
				".gh__error { background: #e74c3c; border-top: 1px solid rgba(255, 255, 255, .5); box-shadow: 0px 2px 10px rgba(231, 76, 60, .5); box-sizing: border-box; color: #fff; padding: 12px; width: 100%; }" +
				".gh__quantity { font-style: italic; margin: 12px 0px 0px 0px; }" +
				".gh__win_chance { display: inline-block; font-size: 14px; line-height: 14px; position: relative; top: -4px; }"
			);

		/**
		 * Push the page down to make room for notifications
		 */
		function updateTopMargin() {
			$("html").css("margin-top", (gleam_helper_container.is(":visible") ? gleam_helper_container.outerHeight() : 0));
		}

		/**
		 * Print details about how many rewards are up for grabs
		 */
		function showQuantity() {
			var num_rewards = gleamHelper.getQuantity(),
				num_remaining = gleamHelper.getRemainingQuantity(),
				msg = "(" + num_rewards.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " " + (num_rewards == 1 ? "reward" : "rewards") + " being given away" +
					(num_remaining === false ? "" : ";<br>~" + num_remaining.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " remaining") + ")";

			$(".incentive-description h3").append($("<div>", { html: msg, class: "gh__quantity" }));
		}

		/**
		 * Print details about how likely you are to get an reward
		 */
		function updateWinChance() {
			win_chance_container.text("(~" + gleamHelper.calcWinChance() + "% to win)");
		}

		return {
			/**
			 * Print the UI
			 */
			loadUI: function() {
				$("body").append(gleam_helper_container);
				$("#current-entries .status.ng-binding").append(win_chance_container);
				$("html").css("overflow-y", "scroll");
				setInterval(updateWinChance, 500);
				showQuantity();
			},

			/**
			 * Print an error
			 */
			showError: function(msg) {
				// Don't print the same error multiple times
				if(active_errors.indexOf(msg) == -1) {
					active_errors.push(msg);
					gleam_helper_container.append($("<div>", { class: "gh__error" }).html("Gleam.helper Error: " + msg));
					updateTopMargin();
				}
			},

			/**
			 * Display or update a notification
			 */
			showNotification: function(notification_id, msg, hide_delay) {
				if(!active_notifications[notification_id]) {
					// New notification
					active_notifications[notification_id] = $("<div>", { class: "gh__notification" });
					gleam_helper_container.append(active_notifications[notification_id]);
				}

				// Update notification
				active_notifications[notification_id].html("Gleam.helper Notification: " + msg);
				updateTopMargin();

				// Automatically hide notification after a delay
				if(typeof hide_delay == "number") {
					var self = this;
					setTimeout(function() {
						self.hideNotification(notification_id);
					}, hide_delay);
				}
			},

			/**
			 * Remove a notification
			 */
			hideNotification: function(notification_id) {
				if(active_notifications[notification_id]) {
					var old_notification = active_notifications[notification_id];

					delete active_notifications[notification_id];
					old_notification.slideUp(400, function() {
						old_notification.remove();
						updateTopMargin();
					});
				}
			},

			/**
			 *
			 */
			addButton: function(button_id, entry_element, label, click_function) {
				var target = $(entry_element).find(">a").first(),
					new_button =
						$("<a>", { class: "gh__button btn btn-embossed btn-info" }).append(
							$("<span>", { text: label })).append(
							$("<span>", { class: "fa ng-scope fa-refresh fa-spin", css: { display: "none" }})
						).click(function(e) {
							e.stopPropagation();
							if(!active_buttons[button_id].find(".fa").is(":visible")) {
								click_function();
							}
						});

				active_buttons[button_id] = new_button;
				target.append(new_button);
			},

			/**
			 *
			 */
			removeButton: function(button_id) {
				active_buttons[button_id].remove();
				delete active_buttons[button_id];
			},

			/**
			 *
			 */
			setButtonLabel: function(button_id, label) {
				active_buttons[button_id].find("span").first().text(label);
			},

			/**
			 *
			 */
			showButtonLoading: function(button_id) {
				active_buttons[button_id].find("span").first().hide();
				active_buttons[button_id].find(".fa").show();
			},

			/**
			 *
			 */
			hideButtonLoading: function(button_id) {
				active_buttons[button_id].find("span").first().show();
				active_buttons[button_id].find(".fa").hide();
			}
		};
	})();

	gleamHelper.initGleam();
})();