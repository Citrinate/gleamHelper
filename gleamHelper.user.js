// ==UserScript==
// @name Gleam.helper
// @namespace https://github.com/Citrinate/gleamHelper
// @description Provides some useful Gleam.io features
// @author Citrinate
// @version 1.0.2
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
			
			steam_handler.handleEntry(entry_item, entry_data);
			//gleamHelperUI.addButton(entry_item, "Join Group", function() { steam_handler.sendMessage("join", entry_data); });
			//gleamHelperUI.addButton(entry_item, "Leave Group", function() { steam_handler.sendMessage("leave", entry_data); });
		}

		// handles steam group buttons
		var loadSteamHandler = (function() {
			function init() {
				// Need some way to communicate with steamcommunity.com that is preferrably transparent
				// to the user.  command_hub is simply a page on steamcommunity.com that can be loaded
				// into an iframe.  We can communicate with the iframe from here and use it as our
				// interface to joining and leaving Steam groups.
				var command_hub = document.createElement('iframe'),
					command_hub_loaded = false,
					notification_id = 0,
					active_groups = null,
					button_id = "steam_group_button_";
				
				command_hub.style.display = "none";
				command_hub.src = command_hub_url;
				document.body.appendChild(command_hub);

				window.addEventListener("message", function(event) {
					if(event.source == command_hub.contentWindow) {
						if(event.data.status == "ready") {
							command_hub_loaded = true;
							active_groups = event.data.groups;
						} else if(event.data.status == "joined") {
							groupJoined(event.data);
						} else if(event.data.status == "left") {
							groupLeft(event.data);
						} else if(event.data.status == "not_logged_in") {
							gleamHelperUI.showError('You must be logged into <a href="https://steamcommunity.com" style="color: #fff" target="_blank">steamcommunity.com</a>');
						} else if(event.data.status == "missing_group_data") {
							gleamHelperUI.showError("Unable to determine what groups you're a member of");
						}
					}
				});
				
				function createButton(entry_item, entry_data) {
					var group_name = entry_data.entry_method.config3,
						group_id = entry_data.entry_method.config4,
						starting_label = active_groups.indexOf(group_name) == -1 ? "Join Group" : "Leave Group";
					
					gleamHelperUI.addButton(button_id + group_id, entry_item, starting_label, function() {
						toggleGroupStatus(entry_data);
						gleamHelperUI.showLoading(button_id + group_id);
					});
				}
				
				function groupJoined(data) {
					active_groups.push(data.name);
					gleamHelperUI.setLabel(button_id + data.id, "Leave Group");
					gleamHelperUI.hideLoading(button_id + data.id);
				}
				
				function groupLeft(data) {
					active_groups.splice(active_groups.indexOf(data.name), 1);
					gleamHelperUI.setLabel(button_id + data.id, "Join Group");
					gleamHelperUI.hideLoading(button_id + data.id);
				}
				
				function toggleGroupStatus(entry_data) {
					var group_name = entry_data.entry_method.config3,
						group_id = entry_data.entry_method.config4;
					
					if(active_groups.indexOf(group_name) == -1) {
						command_hub.contentWindow.postMessage({action: "join", name: group_name, id: group_id}, "*");
					} else {
						command_hub.contentWindow.postMessage({action: "leave", name: group_name, id: group_id}, "*");
					}
				}

				return {
					handleEntry: function(entry_item, entry_data) {
						if(command_hub_loaded) {
							createButton(entry_item, entry_data);
						} else {
							// wait for the command hub to load
							var temp_interval = setInterval(function() {
								if(command_hub_loaded) {
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
				temp_interval = setInterval(function() {
					if(jQuery(".popup-blocks-container") !== null) {
						clearInterval(temp_interval);
						gleam = angular.element(jQuery(".popup-blocks-container")).scope();
						gleamHelperUI.loadUI();
						handleEntries();
					}
				}, 500);
			},
			
			getQuantity: function() {
				return gleam.incentives[0].quantity.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
				setInterval(this.updateWinChance, 500);
				this.showQuantity();
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
			
			showQuantity: function() {
				$(".incentive-description h3").append("(" + gleamHelper.getQuantity() + " reward(s) being given away)");
			},
			
			updateWinChance: function() {
				win_chance_container.text("(~" + gleamHelper.calcWinChance() + "% to win)");
			},

			addButton: function(button_id, entry_item, label, click_function) {
				var target = jQuery(entry_item).find(">a").first(),
					new_button = 
						jQuery("<a>", { class: button_class, css: button_style}).append(
							jQuery("<span>", { text: label })).append(
							jQuery("<span>", { class: "fa ng-scope fa-refresh fa-spin", css: { display: "none" }})
						).click(function(e) {
							e.stopPropagation();
							if(!active_buttons[button_id].find(".fa").is(":visible")) {
								click_function();
							}
						});
					
				active_buttons[button_id] = new_button;
				target.append(new_button);
			},
			
			setLabel: function(button_id, label) {
				active_buttons[button_id].find("span").first().text(label);
			},
			
			showLoading: function(button_id) {
				active_buttons[button_id].find("span").first().hide();
				active_buttons[button_id].find(".fa").show();
			},
			
			hideLoading: function(button_id) {
				active_buttons[button_id].find("span").first().show();
				active_buttons[button_id].find(".fa").hide();
			}
		};
	})();

	// does the actual steam group joining/leaving
	function initSteamCommandHub() {
		var active_groups = null,
			logged_in = g_steamID !== false;
		
		if(logged_in) {
			// make note of what groups we're already a member of
			jQuery.ajax({
				url: "https://steamcommunity.com/my/groups",
				async: false,
				complete: function(data) {
					if(data.responseText.toLowerCase().indexOf("you belong to 0 groups") != -1) {
						// user isn't a member of any steam groups
						active_groups = [];
					} else {
						jQuery(data.responseText).find(".groupBlock a.linkTitle").each(function() {
							var group_name = jQuery(this).attr("href").replace("https://steamcommunity.com/groups/", "");
							if(active_groups === null) active_groups = [];
							active_groups.push(group_name);
						});
					}
				}
			});
		}
		
		if(active_groups === null) {
			parent.postMessage({status: "missing_group_data"}, "*");
		} else {
			parent.postMessage({status: "ready", groups: active_groups}, "*");

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
			
		}

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