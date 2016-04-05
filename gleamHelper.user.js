// ==UserScript==
// @name Gleam.helper
// @namespace https://github.com/Citrinate/gleamHelper
// @description Provides some useful Gleam.io features
// @author Citrinate
// @version 1.0.0
// @match *://gleam.io/*
// @match https://steamcommunity.com/app/329630
// @updateURL https://raw.githubusercontent.com/Citrinate/gleamHelper/master/gleamHelper.user.js
// @downloadURL https://raw.githubusercontent.com/Citrinate/gleamHelper/master/gleamHelper.user.js
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
			var entries = jQuery(".entry-method");

			for(var i = 0; i < entries.length; i++) {
				var entry_item = entries[i];
				var entry_data = angular.element(entries[i]).scope();
				
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
			
			gleamHelperUI.addButton(entry_item, "Join", function() { steam_handler.sendMessage("join", entry_data); }, function() {
				gleamHelperUI.addButton(entry_item, "Leave", function() { steam_handler.sendMessage("leave", entry_data); });
			});
		}

		// handles steam_join_group entries
		var loadSteamHandler = (function() {
			function init() {
				// Need some way to communicate with steamcommunity.com that is preferrably transparent
				// to the user.  command_hub is simply a page on steamcommunity.com that can be loaded
				// into an iframe.  We can communicate with the iframe from here and use it as our
				// interface to joining and leaving Steam groups.
				var command_hub = document.createElement('iframe'),
					command_hub_loaded = false,
					notification_id = 0;
				
				command_hub.style.display = "none";
				command_hub.src = command_hub_url;
				document.body.appendChild(command_hub);

				window.addEventListener("message", function(event) {
					if(event.source == command_hub.contentWindow) {
						if(event.data.status == "ready") {
							command_hub_loaded = true;
						} else if(event.data.status == "joined") {
							gleamHelperUI.showNotification("steamHandlerNotify" + notification_id, "Joined Group: " + event.data.name, 3000);
						} else if(event.data.status == "left") {
							gleamHelperUI.showNotification("steamHandlerNotify" + notification_id, "Left Group: " + event.data.name, 3000);
						} else if(event.data.status == "not_logged_in") {
							gleamHelperUI.showError('You must be logged into <a href="https://steamcommunity.com" style="color: #fff" target="_blank">steamcommunity.com</a>');
						}
					}
				});

				return {					
					sendMessage: function(msg, entry_data) {
						var group_name = entry_data.entry_method.config3,
							group_id = entry_data.entry_method.config4;
						
						if(command_hub_loaded) {
							command_hub.contentWindow.postMessage({action: msg, name: group_name, id: group_id}, "*");
						} else {
							// wait for the command hub to load
							var temp_interval = setInterval(function() {
								if(command_hub_loaded) {
									clearInterval(temp_interval);
									command_hub.contentWindow.postMessage({action: msg, name: group_name, id: group_id}, "*");
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
				temp_interval = setInterval(function() {
					if(jQuery(".popup-blocks-container") !== null) {
						clearInterval(temp_interval);
						gleam = angular.element(jQuery(".popup-blocks-container")).scope();
						gleamHelperUI.loadUI();
						handleEntries();
					}
				}, 500);
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
		    button_class = "btn btn-embossed btn-info",
		    button_style = { margin: "2px 0px 2px 16px" },
			selectbox_style = { margin: "0px 0px 0px 16px" },
		    container_style = { fontSize: "18px", left: "0px", position: "fixed", top: "0px", width: "100%", zIndex: "9999999999" },
			notification_style = { background: "#000", boxShadow: "-10px 2px 10px #000", color: "#3498db", padding: "8px", width: "100%", },
			error_style = { background: "#e74c3c", boxShadow: "-10px 2px 10px #e74c3c", color: "#fff", padding: "8px", width: "100%" },
			win_chance_style = { display: "inline-block", fontSize: "14px", lineHeight: "14px", position: "relative", top: "-4px" },		
			win_chance_container = jQuery("<span>", { css: win_chance_style }),
			gleam_helper_container = jQuery("<div>", { css: container_style });

		// push the page down to make room for notifications
		function updateTopMargin() {
			jQuery("html").css("margin-top", (gleam_helper_container.is(":visible") ? gleam_helper_container.outerHeight() : 0));
		}
			
		return {
			// print the UI
			loadUI: function() {
				jQuery("body").append(gleam_helper_container);
				jQuery("#current-entries .status.ng-binding").append(win_chance_container);
				jQuery("html").css("overflow-y", "scroll");				
				setInterval(this.updateWinChance(), 500);
			},

			addButton: function(entry_item, label, click_action, after_action) {
				// the entry may not be visible yet, wait until it is before adding the button
				var temp_interval = setInterval(function() {
					if(jQuery(entry_item).find(">a").first().is(":visible")) {
						clearInterval(temp_interval);
						jQuery(entry_item).append(
							jQuery("<a>", { text: label, class: button_class, css: button_style}).click(function() {
								jQuery(this).unbind("click");
								click_action();
							})
						);
						
						// what to do after a button has been added
						// useful when adding multiple buttons and you want them to be in a certain order
						if(typeof after_action == "function") {
							after_action();
						}
					}
				}, Math.random() * 1000);
			},
			
			// print an error
			showError: function(msg) {
				// don't print the same error multiple times
				if(active_errors.indexOf(msg) == -1) {
					active_errors.push(msg);
					gleam_helper_container.append(jQuery("<div>", { css: error_style }).html("Gleam.helper Error: " + msg));
					updateTopMargin();
				}
			},
			
			// display or update a notification
			showNotification: function(notification_id, msg, hide_delay) {				
				if(!active_notifications[notification_id]) {
					// new notification
					active_notifications[notification_id] = jQuery("<div>", { css: notification_style });
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
			
			updateWinChance: function() {
				win_chance_container.text("(~" + gleamHelper.calcWinChance() + "% to win)");
			}
		};
	})();

	// does the actual steam group joining/leaving
	function initSteamCommandHub() {
		var logged_in = g_steamID !== false;
		
		parent.postMessage({status: "ready"}, "*");

		// wait for our parent to tell us what to do
		window.addEventListener("message", function(event) {
			if(event.source == parent && event.origin == "https://gleam.io") {
				if(!logged_in) {
					parent.postMessage({status: "not_logged_in"}, "*");
				} else {
					if(event.data.action == "join") {
						joinGroup(event.data.name, event.data.id);
					} else if(event.data.action == "leave") {
						leaveGroup(event.data.name, event.data.id);
					}
				}
			}
		}, false);

		function joinGroup(group_name, group_id) {
			jQuery.ajax({
				url: "https://steamcommunity.com/groups/" + group_name,
				type: "POST",
				data: {action: "join", sessionID: g_sessionID},
				complete: function() {
					parent.postMessage({status: "joined", name: group_name, id: group_id}, "*");
				}
			});
		}

		function leaveGroup(group_name, group_id) {
			jQuery.ajax({
				url: jQuery(".playerAvatar a").attr("href").replace("http://", "https://") + "home_process",
				type: "POST",
				data: {sessionID: g_sessionID, action: "leaveGroup", groupId: group_id},
				complete: function() {
					parent.postMessage({status: "left", name: group_name, id: group_id}, "*");
				}
			});
		}
	}

	// determine where we are and call the appropriate function
	if(document.location.hostname == "gleam.io") {
		gleamHelper.initGleam();
	} else if(document.location == command_hub_url) {
		initSteamCommandHub();
	}
})();