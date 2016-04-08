// ==UserScript==
// @name Gleam.helper
// @namespace https://github.com/Citrinate/gleamHelper
// @description Enhances Gleam.io giveaways
// @author Citrinate
// @version 1.1.0
// @match http://gleam.io/*
// @match https://gleam.io/*
// @connect steamcommunity.com
// @grant GM_xmlhttpRequest
// @grant unsafeWindow
// @updateURL https://raw.githubusercontent.com/Citrinate/gleamHelper/master/gleamHelper.user.js
// @downloadURL https://raw.githubusercontent.com/Citrinate/gleamHelper/master/gleamHelper.user.js
// @require http://ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js
// @run-at document-end
// ==/UserScript==

(function() {
	// command_hub_url is the only page on steamcommunity that this script will be injected at (as referenced in @match above)
	// it can be any page on steamcommunity.com that can be loaded into an iframe
	var command_hub_url = "https://steamcommunity.com/app/329630";

	var gleamHelper = (function() {
		var gleam = null,
			steam_handler = null;

		// decide what to do for each of the entries
		function handleEntries() {
			var entries = $(".entry-method");

			for(var i = 0; i < entries.length; i++) {
				var entry_item = entries[i];
				var entry_data = unsafeWindow.angular.element(entries[i]).scope();

				switch(entry_data.entry_method.entry_type) {
					case "steam_join_group":
						handleSteamEntry(entry_item, entry_data);
						break;

					default:
						break;
				}
			}
		}

		function handleSteamEntry(entry_item, entry_data) {
			if(steam_handler === null) {
				steam_handler = loadSteamHandler.getInstance();
			}

			steam_handler.handleEntry(entry_item, entry_data);
		}

		// handles steam group buttons
		var loadSteamHandler = (function() {
			function init() {
				var steam_id = null,
					session_id = null,
					process_url = null,
					active_groups = null,
					button_id = "steam_group_button_",
					ready = false;

				// get all the user data we'll need to make join/leave group requests
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

						// determine what groups the user is already a member of
						if($(response.responseText).find(".groupBlock").length === 0) {
							// user isn't a member of any steam groups
							active_groups = [];
						} else {
							$(response.responseText).find(".groupBlock a.linkTitle").each(function() {
								var group_name = $(this).attr("href").replace("https://steamcommunity.com/groups/", "");
								if(active_groups === null) active_groups = [];
								active_groups.push(group_name);
							});
						}

						ready = true;
					}
				});

				// add a join/leave toggle button to the entry
				function createButton(entry_item, entry_data) {
					if(steam_id === null || session_id === null || process_url === null) {
						// we're not logged in, try to mark it anyway incase we're already a member of the group
						markEntryCompleted(entry);
						gleamHelperUI.showError('You must be logged into <a href="https://steamcommunity.com" style="color: #fff" target="_blank">steamcommunity.com</a>');
					} else if(active_groups === null) {
						// couldn't get user's group data
						markEntryCompleted(entry);
						gleamHelperUI.showError("Unable to determine what Steam groups you're a member of");
					} else {
						var group_name = entry_data.entry_method.config3,
							group_id = entry_data.entry_method.config4,
							starting_label = active_groups.indexOf(group_name) == -1 ? "Join Group" : "Leave Group";

						gleamHelperUI.addButton(button_id + group_id, entry_item, starting_label, function() {
							toggleGroupStatus(group_name, group_id);
							gleamHelperUI.showButtonLoading(button_id + group_id);
						});
					}
				}

				// toggle group status between "joined" and "left"
				function toggleGroupStatus(group_name, group_id) {
					if(active_groups.indexOf(group_name) == -1) {
						joinGroup(group_name, group_id, function() {
							active_groups.push(group_name);
							gleamHelperUI.setButtonLabel(button_id + group_id, "Leave Group");
							gleamHelperUI.hideButtonLoading(button_id + group_id);
						});
					} else {
						leaveGroup(group_name, group_id, function() {
							active_groups.splice(active_groups.indexOf(group_name), 1);
							gleamHelperUI.setButtonLabel(button_id + group_id, "Join Group");
							gleamHelperUI.hideButtonLoading(button_id + group_id);
						});
					}
				}

				function joinGroup(group_name, group_id, callback) {
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

				function leaveGroup(group_name, group_id, callback) {
					GM_xmlhttpRequest({
						url: process_url,
						method: "POST",
						headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
						data: $.param({sessionID: session_id, action: "leaveGroup", groupId: group_id}),
						onload: function(response) {
							if(typeof callback == "function") {
								callback();
							}
						}
					});
				}

				return {
					handleEntry: function(entry_item, entry_data) {
						if(ready) {
							createButton(entry_item, entry_data);
						} else {
							// wait for the command hub to load
							var temp_interval = setInterval(function() {
								if(ready) {
									clearInterval(temp_interval);
									createButton(entry_item, entry_data);
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

			// # of rewards being given away
			getQuantity: function() {
				return gleam.incentives[0].quantity;
			},

			// estimate the minimum number of rewards remaining
			getRemainingQuantity: function(callback) {
				if(gleam.campaign.campaign_type == "Reward") {
					// gleam doesn't report how many rewards have been distributed,
					// they only report how many entries have been completed, and how many entries are required for a reward
					// some users may only complete a few entries, not enough for them to get a reward,
					// and so this is only an estimate, but we can say there's at least this many left
					var est_remaining = gleam.incentives[0].quantity - Math.floor(gleam.campaign.entry_count / gleam.incentives[0].actions_required);

					return Math.max(0, est_remaining);
				}

				return false;
			},

			// estimate the probability of winning a raffle
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
		    button_class = "btn btn-embossed btn-info",
		    button_style = { bottom: "0px", height: "20px", margin: "auto", padding: "6px", position: "absolute", right: "64px", top: "0px" },
		    container_style = { fontSize: "18px", left: "0px", position: "fixed", top: "0px", width: "100%", zIndex: "9999999999" },
			notification_style = { background: "#000", boxShadow: "-10px 2px 10px #000", color: "#3498db", padding: "8px", width: "100%", },
			error_style = { background: "#e74c3c", boxShadow: "-10px 2px 10px #e74c3c", color: "#fff", padding: "8px", width: "100%" },
			quantity_style = { fontStyle: "italic", margin: "12px 0px 0px 0px" },
			win_chance_style = { display: "inline-block", fontSize: "14px", lineHeight: "14px", position: "relative", top: "-4px" },
			win_chance_container = $("<span>", { css: win_chance_style }),
			gleam_helper_container = $("<div>", { css: container_style });

		// push the page down to make room for notifications
		function updateTopMargin() {
			$("html").css("margin-top", (gleam_helper_container.is(":visible") ? gleam_helper_container.outerHeight() : 0));
		}

		// print details about how many rewards are up for grabs
		function showQuantity() {
			var num_rewards = gleamHelper.getQuantity(),
				num_remaining = gleamHelper.getRemainingQuantity(),
				msg = "(" + num_rewards.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " " + (num_rewards == 1 ? "reward" : "rewards") + " being given away" +
					(num_remaining === false ? "" : ";<br>~" + num_remaining.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " remaining") + ")";

			$(".incentive-description h3").append($("<div>", { html: msg, css: quantity_style }));
		}

		// print details about how likely you are to get an reward
		function updateWinChance() {
			win_chance_container.text("(~" + gleamHelper.calcWinChance() + "% to win)");
		}

		return {
			// print the UI
			loadUI: function() {
				$("body").append(gleam_helper_container);
				$("#current-entries .status.ng-binding").append(win_chance_container);
				$("html").css("overflow-y", "scroll");
				setInterval(updateWinChance, 500);
				showQuantity();
			},

			// print an error
			showError: function(msg) {
				// don't print the same error multiple times
				if(active_errors.indexOf(msg) == -1) {
					active_errors.push(msg);
					gleam_helper_container.append($("<div>", { css: error_style }).html("Gleam.helper Error: " + msg));
					updateTopMargin();
				}
			},

			// display or update a notification
			showNotification: function(notification_id, msg, hide_delay) {
				if(!active_notifications[notification_id]) {
					// new notification
					active_notifications[notification_id] = $("<div>", { css: notification_style });
					gleam_helper_container.append(active_notifications[notification_id]);
				}

				// update notification
				active_notifications[notification_id].html("Gleam.helper Notification: " + msg);
				updateTopMargin();

				// automatically hide notification after a delay
				if(typeof hide_delay == "number") {
					var self = this;
					setTimeout(function() {
						self.hideNotification(notification_id);
					}, hide_delay);
				}
			},

			// remove a notification
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

			addButton: function(button_id, entry_item, label, click_function) {
				var target = $(entry_item).find(">a").first(),
					new_button =
						$("<a>", { class: button_class, css: button_style}).append(
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

			setButtonLabel: function(button_id, label) {
				active_buttons[button_id].find("span").first().text(label);
			},

			showButtonLoading: function(button_id) {
				active_buttons[button_id].find("span").first().hide();
				active_buttons[button_id].find(".fa").show();
			},

			hideButtonLoading: function(button_id) {
				active_buttons[button_id].find("span").first().show();
				active_buttons[button_id].find(".fa").hide();
			}
		};
	})();

	gleamHelper.initGleam();
})();