// ==UserScript==
// @name Gleam.helper
// @namespace https://github.com/Citrinate/gleamHelper
// @description Enhances Gleam.io giveaways
// @author Citrinate
// @version 1.2.1
// @match https://gleam.io/*
// @match https://player.twitch.tv/
// @connect steamcommunity.com
// @connect twitter.com
// @connect twitch.tv
// @grant GM_getValue
// @grant GM_setValue
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
		var gleam = null,
			authentications = {};

		/**
		 * Check to see what accounts the user has linked to gleam
		 */
		function checkAuthentications() {
			if(gleam.contestantState.contestant.authentications) {
				var authentication_data = gleam.contestantState.contestant.authentications;

				for(var i = 0; i < authentication_data.length; i++) {
					var current_authentication = authentication_data[i];
					authentications[current_authentication.provider] = current_authentication;
				}
			}
		}

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

					case "twitchtv_follow":
						loadTwitchHandler.getInstance().handleEntry(entry, entry_element);
						break;

					case "twitter_follow":
					case "twitter_retweet":
					case "twitter_tweet":
					case "twitter_hashtags":
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
					method: "GET",
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
					checkAuthentications();

					if(!authentications.steam) {
						// The user doesn't have a Steam account linked, do nothing
					} else if(steam_id === null || session_id === null || process_url === null) {
						// We're not logged in
						gleamHelperUI.showError('You must be logged into <a href="https://steamcommunity.com" target="_blank">steamcommunity.com</a>');
					} else if(authentications.steam.uid != steam_id) {
						// We're logged in as the wrong user
						gleamHelperUI.showError('You must be logged into the Steam account linked to Gleam.io: <a href="https://steamcommunity.com/profiles/' + authentications.steam.uid + '/" target="_blank">https://steamcommunity.com/profiles/' + authentications.steam.uid + '/</a>');
					} else if(active_groups === null) {
						// Couldn't get user's group data
						gleamHelperUI.showError("Unable to determine what Steam groups you're a member of");
					} else {
						// Create the button
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
					var steam_community_down_error = "The Steam Community is experiencing issues. " +
						"Please handle any remaining Steam entries manually.<br>" +
						"If you're having trouble getting groups to appear on " +
						'<a href="https://steamcommunity.com/my/groups/">your groups list</a>, ' +
						'joining a <a href="https://steamcommunity.com/search/#filter=groups">new group</a> may force the list to update.';

					if(active_groups.indexOf(group_name) == -1) {
						joinSteamGroup(group_name, group_id, function(success) {
							if(success) {
								active_groups.push(group_name);
								gleamHelperUI.setButtonLabel(button_id, "Leave Group");
							} else {
								gleamHelperUI.showError(steam_community_down_error);
							}

							gleamHelperUI.hideButtonLoading(button_id);
						});
					} else {
						leaveSteamGroup(group_name, group_id, function(success) {
							if(success) {
								active_groups.splice(active_groups.indexOf(group_name), 1);
								gleamHelperUI.setButtonLabel(button_id, "Join Group");
							} else {
								gleamHelperUI.showError(steam_community_down_error);
							}

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
							GM_xmlhttpRequest({
								url: "https://steamcommunity.com/my/groups",
								method: "GET",
								onload: function(response) {
									if(typeof callback == "function") {
										if($(response.responseText.toLowerCase()).find("a[href='https://steamcommunity.com/groups/" + group_name + "']").length === 0) {
											// Failed to join the group, Steam Community is probably down
											callback(false);
										} else {
											callback(true);
										}
									}
								}
							});
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
								if($(response.responseText.toLowerCase()).find("a[href='https://steamcommunity.com/groups/" + group_name + "']").length !== 0) {
									// Failed to leave the group, Steam Community is probably down
									callback(false);
								} else {
									callback(true);
								}
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
							}, 100);
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
					user_id = null,
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
						user_id = $(response.responseText).find(".account-group.js-mini-current-user").attr("data-user-id");
						auth_token = typeof auth_token == "undefined" ? null : auth_token;
						user_handle = typeof user_handle == "undefined" ? null : user_handle;
						user_id = typeof user_id == "undefined" ? null : user_id;
						ready = true;
					}
				});

				/**
				 * Get ready to create an item
				 */
				function prepCreateButton(entry, entry_element) {
					/* Wait until the entry is completed before showing the button,
					and only show a button for entries that start out as uncompleted */
					if(!gleam.isEntered(entry.entry_method)) {
						var start_time = +new Date();

						var temp_interval = setInterval(function() {
							if(gleam.isEntered(entry.entry_method)) {
								clearInterval(temp_interval);
								createButton(entry_element, entry, start_time, +new Date());
							}
						}, 100);
					}
				}

				/**
				 * Create the button
				 */
				function createButton(entry_element, entry, start_time, end_time) {
					checkAuthentications();

					if(!authentications.twitter) {
						// The user doesn't have a Twitter account linked, do nothing
					} else if(auth_token === null || user_handle === null) {
						// We're not logged in
						gleamHelperUI.showError('You must be logged into <a href="https://twitter.com" target="_blank">twitter.com</a>');
					} else if(authentications.twitter.uid != user_id) {
						// We're logged in as the wrong user
						gleamHelperUI.showError('You must be logged into the Twitter account linked to Gleam.io: <a href="https://twitter.com/profiles/' + authentications.twitter.reference + '/" target="_blank">https://twitter.com/' + authentications.twitter.reference + '</a>');
					} else {
						// Create the button
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
						} else if(entry.entry_method.entry_type == "twitter_tweet" || entry.entry_method.entry_type == "twitter_hashtags") {
							// Delete Tweet button
							gleamHelperUI.addButton(button_id, entry_element, "Delete Tweet", function() {
								gleamHelperUI.removeButton(button_id);

								/* We don't have an id for the tweet, so instead delete the first tweet we can find
								that was posted after we handled the entry, but before it was marked completed.

								Tweets are instantly posted to our profile, but there's a delay before they're made
								public (a few seconds).  Increase the range by a few seconds to compensate. */
								getTwitterTweet(start_time, end_time + 60 * 1000, function(tweet_id) {
									if(tweet_id === false) {
										gleamHelperUI.showError('Failed to find <a href="https://twitter.com/' + user_handle + '" target="_blank">Tweet</a>');
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
						gleamHelperUI.showError('Failed to unfollow Twitter user: <a href="https://twitter.com/' + twitter_handle + '" target="_blank">' + twitter_handle + '</a>');
					} else {
						GM_xmlhttpRequest({
							url: "https://twitter.com/i/user/unfollow",
							method: "POST",
							headers: { "Origin": "https://twitter.com", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
							data: $.param({ authenticity_token: auth_token, user_id: twitter_id }),
							onload: function(response) {
								if(response.status != 200) {
									gleamHelperUI.showError('Failed to unfollow Twitter user: <a href="https://twitter.com/' + twitter_handle + '" target="_blank">' + twitter_handle + '</a>');
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
								gleamHelperUI.showError('Failed to delete <a href="https://twitter.com/' + user_handle + '" target="_blank">' + (retweet ? "Retweet" : "Tweet") + '</a>');
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
							}, 100);
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
		 * Handles all Twitch entries that may need to interact with Twitch
		 */
		var loadTwitchHandler = (function() {
			function init() {
				var command_hub_url = "https://player.twitch.tv/",
					user_handle = null,
					api_token = null,
					button_base_id = "twitchtv_button_",
					ready = false;

				// Get all the user data we'll need to undo twitch entries
				loadCommandHub(command_hub_url, function() {
					return {
						user_handle: getCookie("login"),
						api_token: getCookie("api_token")
					};
				}, function(data) {
					user_handle = data.user_handle;
					api_token = data.api_token;
					ready = true;
				});

				/**
				 * Get ready to create an item
				 */
				function prepCreateButton(entry, entry_element) {
					/* Wait until the entry is completed before showing the button,
					and only show a button for entries that start out as uncompleted */
					if(!gleam.isEntered(entry.entry_method)) {
						var start_time = +new Date();

						var temp_interval = setInterval(function() {
							if(gleam.isEntered(entry.entry_method)) {
								clearInterval(temp_interval);
								createButton(entry_element, entry, start_time, +new Date());
							}
						}, 100);
					}
				}

				/**
				 * Create the button
				 */
				function createButton(entry_element, entry, start_time, end_time) {
					checkAuthentications();

					if(!authentications.twitchtv) {
						// The user doesn't have a Twitter account linked, do nothing
					} else if(user_handle === null || api_token === null) {
						// We're not logged in
						gleamHelperUI.showError('You must be logged into <a href="https://twitch.tv" target="_blank">twitch.tv</a>');
					} else if(authentications.twitchtv.reference != user_handle) {
						// We're logged in as the wrong user
						gleamHelperUI.showError('You must be logged into the Twitch account that\'s linked to Gleam.io ' +
								'(<a href="https://twitch.tv/' + authentications.twitchtv.reference + '/" target="_blank">' +
								'twitch.tv/' + authentications.twitchtv.reference + '</a>). Please login to the linked account and then reload the page.');
					} else {
						// Create the button
						var button_id = button_base_id + entry.entry_method.id;

						if(entry.entry_method.entry_type == "twitchtv_follow") {
							// Unfollow button
							var twitch_handle = entry.entry_method.config1;

							gleamHelperUI.addButton(button_id, entry_element, "Unfollow", function() {
								gleamHelperUI.removeButton(button_id);
								deleteTwitchFollow(twitch_handle);
							});
						}
					}
				}

				/**
				 *
				 */
				function deleteTwitchFollow(twitch_handle) {
					GM_xmlhttpRequest({
						url: "https://api.twitch.tv/kraken/users/" + user_handle + "/follows/channels/" + twitch_handle,
						method: "DELETE",
						headers: { "Twitch-Api-Token": api_token },
						onload: function(response) {
							if(response.status != 204 && response.status != 200) {
								gleamHelperUI.showError('Failed to unfollow Twitch user: <a href="https://twitch.tv/' + twitch_handle + '" target="_blank">' + twitch_handle + '</a>');
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
							}, 100);
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
						}, 100);
					}
				}, 100);
			},

			/**
			 * @return {Number|Boolean} quantity - # of rewards being given away, false if not defined
			 */
			getQuantity: function() {
				return !!gleam.incentives[0].quantity ? gleam.incentives[0].quantity : false;
			},

			/**
			 * @return {Boolean|Number} remaining - Estimated # of remaining rewards, false if not an instant-win giveaway
			 */
			getRemainingQuantity: function(callback) {
				if(gleam.campaign.campaign_type == "Reward" && gleam.campaign.entry_count !== 0) {
					/* Gleam doesn't report how many rewards have been distributed.  They only report how many entries have been
					completed, and how many entries are required for a reward.  Some users may only complete a few entries, not enough
					for them to get a reward, and so this is only an estimate, but we can say there's at least this many left. */
					var est_remaining = gleam.incentives[0].quantity - Math.floor(gleam.campaign.entry_count / gleam.incentives[0].actions_required);

					return Math.max(0, est_remaining);
				}

				return false;
			},

			/**
			 * @return {Number|Boolean} chance - Estimated probability of winning a raffle rounded to 2 decimal places, false if impossible to tell
			 */
			calcWinChance: function() {
				if(!!gleam.incentives[0].quantity) {
					var your_entries = gleam.contestantEntries(),
						total_entries = gleam.campaign.entry_count,
						num_rewards = gleam.incentives[0].quantity;

					if(gleam.campaign.entry_count !== 0) {
						return Math.round(10000 * (1 - Math.pow((total_entries - your_entries) / total_entries, num_rewards))) / 100;
					}
				}

				return false;
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
				"html { overflow-y: scroll !important; }" +
				".gh__main_container { font-size: 16.5px; left: 0px; position: fixed; text-align: center; top: 0px; width: 100%; z-index: 9999999999; }" +
				".gh__button { bottom: 0px; height: 20px; margin: auto; padding: 6px; position: absolute; right: 64px; top: 0px; z-index: 9999999999; }" +
				".gh__notification { background: #000; border-top: 1px solid rgba(52, 152, 219, .5); box-shadow: 0px 2px 10px rgba(0, 0, 0, .5); box-sizing: border-box; color: #3498db; line-height: 22px; padding: 12px; width: 100%; }" +
				".gh__error { background: #e74c3c; border-top: 1px solid rgba(255, 255, 255, .5); box-shadow: 0px 2px 10px rgba(231, 76, 60, .5); box-sizing: border-box; color: #fff; line-height: 22px; padding: 12px; width: 100%; }" +
				".gh__error a { color: #fff; }" +
				".gh__quantity { font-style: italic; margin: 12px 0px 0px 0px; }" +
				".gh__win_chance { display: inline-block; font-size: 14px; line-height: 14px; position: relative; top: -4px; }" +
				".gh__close { float: right; background: rgba(255, 255, 255, .15); border: 1px solid #fff; box-shadow: 0px 0px 8px rgba(255, 255, 255, .5); cursor: pointer; margin-left: 4px; padding: 0px 4px; }" +
				".gh__close:hover { background: #fff; color: #e74c3c; }" +
				".gh__close::before { content: 'x'; position: relative; top: -1px; }"
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
			var num_rewards = gleamHelper.getQuantity();

			if(!!num_rewards) {
				var	num_remaining = gleamHelper.getRemainingQuantity(),
					msg = "(" + num_rewards.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " " + (num_rewards == 1 ? "reward" : "rewards") + " being given away" +
						(num_remaining === false ? "" : ";<br>~" + num_remaining.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " rewards remaining") + ")";

				$($(".incentive-description h3").get(0)).append($("<div>", { html: msg, class: "gs__quantity" }));
			}
		}

		/**
		 * Print details about how likely you are to get an reward
		 */
		function updateWinChance() {
			var win_chance = gleamHelper.calcWinChance();

			if(win_chance !== false) {
				win_chance_container.text("(~" + gleamHelper.calcWinChance() + "% to win)");
			}
		}

		return {
			/**
			 * Print the UI
			 */
			loadUI: function() {
				$("body").append(gleam_helper_container);
				$("#current-entries .status.ng-binding").append(win_chance_container);
				setInterval(updateWinChance, 500);
				showQuantity();

				// Show exact end date when hovering over any times
				$("[data-ends]").each(function() { $(this).attr("title", new Date(parseInt($(this).attr("data-ends")) * 1000)); });
			},

			/**
			 * Print an error
			 */
			showError: function(msg) {
				// Don't print the same error multiple times
				if(active_errors.indexOf(msg) == -1) {
					var self = this;

					active_errors.push(msg);
					gleam_helper_container.append(
						$("<div>", { class: "gh__error" }).html("<strong>Gleam.helper Error</strong>: " + msg).prepend(
							$("<div>", { class: "gh__close" }).click(function() {
								$(this).unbind("click");
								$(this).parent().slideUp(400, function() {
									active_errors.splice(active_errors.indexOf(msg), 1);
									$(this).remove();
									updateTopMargin();
								});
							})
						));
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
				active_notifications[notification_id].html("<strong>Gleam.helper Notification</strong>: " + msg);
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

	/**
	 * http://stackoverflow.com/a/15724300
	 */
	function getCookie(name) {
		var value = "; " + unsafeWindow.cookie,
			parts = value.split("; " + name + "=");

		if(parts.length == 2) {
			return parts.pop().split(";").shift();
		} else {
			return null;
		}
	}

	/**
	 * Load an iframe so that we can run code on a different domain
	 * @param {String} url - True if we're dealing with a retweet, false for a tweet
	 * @param {Function} data_func - The code that we're going to run inside the iframe
	 * @param {Function} callback - Runs after data_func returns
	 */
	function loadCommandHub(url, data_func, callback) {
		var command_hub = unsafeWindow.createElement('iframe');

		command_hub.style.display = "none";
		command_hub.src = url;
		unsafeWindow.body.appendChild(command_hub);

		window.addEventListener("message", function(event) {
			if(event.source == command_hub.contentWindow) {
				if(event.data.status == "ready") {
					// the iframe has finished loading, tell it what to do
					GM_setValue("command_hub_func", encodeURI(data_func.toString()));
					command_hub.contentWindow.postMessage({ status: "run" }, "*");
				} else if(event.data.status == "finished") {
					// the iframe has finished its job, send the data to the callback and close the frame
					unsafeWindow.body.removeChild(command_hub);
					callback(GM_getValue("command_hub_return"));
				}
			}
		});
	}

	/**
	 *
	 */
	function initCommandHub() {
		// wait for our parent to tell us what to do
		window.addEventListener("message", function(event) {
			if(event.source == parent && event.origin == "https://gleam.io") {
				if(event.data.status == "run") {
					GM_setValue("command_hub_return", eval('(' + decodeURI(GM_getValue("command_hub_func")) + ')')());
					parent.postMessage({ status: "finished" }, "https://gleam.io");
				}
			}
		});

		// let the parent know the iframe is ready
		parent.postMessage({status: "ready"}, "https://gleam.io");
	}

	if(unsafeWindow.location.hostname == "gleam.io") {
		gleamHelper.initGleam();
	} else {
		initCommandHub();
	}
})();
