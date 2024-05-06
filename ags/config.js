const hyprland = await Service.import("hyprland");
const notifications = await Service.import("notifications");
const mpris = await Service.import("mpris");
const audio = await Service.import("audio");
const battery = await Service.import("battery");
const systemtray = await Service.import("systemtray");
import Brightness from "./brightness.js";

// widgets can be only assigned as a child in one container
// so to make a reuseable widget, make it a function
// then you can simply instantiate one by calling it

function Workspaces() {
	const activeId = hyprland.active.workspace.bind("id");
	const workspaces = hyprland.bind("workspaces").as((ws) =>
		ws
			.filter(({ id }) => id > 0)
			.sort((a, b) => a.id - b.id)
			.map(({ id }) =>
				Widget.Button({
					on_clicked: () => hyprland.messageAsync(`dispatch workspace ${id}`),
					child: Widget.Label(` `),
					class_name: activeId.as((i) => `${i === id ? "focused" : ""}`),
				})
			)
	);

	return Widget.Box({
		class_name: "workspaces",
		children: workspaces,
	});
}

function ClientTitle() {
	let title = hyprland.active.client.bind("title");
	return Widget.Label({
		class_name: "client-title",
		label: title,
		truncate: "end",
		max_width_chars: 40,
	});
}

function Clock() {
	return Widget.Label({
		class_name: "clock",
		label: date.bind(),
	});
}

// we don't need dunst or any other notification daemon
// because the Notifications module is a notification daemon itself

const SBrightness = () => {
	return Widget.Box({
		class_name: "brightness",
		children: [
			Widget.Label({
				class_name: "b-label",
				setup: (self) =>
					self.hook(
						Brightness,
						(self, screenValue) => {
							self.label = "󰃚";
						},
						"screen-changed"
					),
			}),
			Widget.Slider({
				class_name: "sliders",
				hexpand: true,
				min: 0.01, // Set min slightly above 0 zero so the display can't be turned all the way off
				max: 1,
				draw_value: false,
				on_change: (self) => (Brightness.screen_value = self.value),
				value: Brightness.bind("screen-value"),
			}),
		],
	});
};

function CpuUsage() {
	const cpu = Variable("", {
		poll: [
			5000,
			["bash", "-c", "top -bn 1 | awk '/Cpu/{print 100-$8}'"],
			(value) => `${Math.round(value)}%`,
		],
	});

	return Widget.Label({
		label: cpu.bind(),
	});
}
const RamUsage = () => {
	const ram = Variable("0", {
		poll: [2000, ["bash", "-c", "free -h | awk '/^Mem:/ {print $3 \"/\" $2}'"]],
	});

	return Widget.Label({
		label: ram.bind().transform((value) => {
			value = value.replaceAll("i", "b");
			return value;
		}),
	});
};

function Volume() {
	const icons = {
		101: "overamplified",
		67: "high",
		34: "medium",
		1: "low",
		0: "muted",
	};

	function getIcon() {
		const icon = audio.speaker.is_muted
			? 0
			: [101, 67, 34, 1, 0].find(
					(threshold) => threshold <= audio.speaker.volume * 100
			  );

		return `audio-volume-${icons[icon]}-symbolic`;
	}

	const icon = Widget.Icon({
		icon: Utils.watch(getIcon(), audio.speaker, getIcon),
	});

	const slider = Widget.Slider({
		hexpand: true,
		draw_value: false,
		class_name: "v-slide",

		on_change: ({ value }) => (audio.speaker.volume = value),
		setup: (self) =>
			self.hook(audio.speaker, () => {
				self.value = audio.speaker.volume || 0;
			}),
	});

	return Widget.Box({
		class_name: "volume",
		css: "min-width: 180px",
		children: [icon, slider],
	});
}

function BatteryLabel() {
	const value = battery.bind("percent").as((p) => (p > 0 ? p / 100 : 0));
	const icon = battery
		.bind("percent")
		.as((p) => `battery-level-${Math.floor(p / 10) * 10}-symbolic`);

	return Widget.Box({
		class_name: "battery",
		visible: battery.bind("available"),
		children: [
			Widget.Icon({ icon }),
			Widget.LevelBar({
				widthRequest: 140,
				vpack: "center",
				value,
			}),
		],
	});
}

let PowerOptions = () => {
	let commands = [
		{ icon: "", command: "systemctl reboot", name: "reboot" },
		{ icon: "", command: "systemctl exit", name: "shutdown" },
	];
	return Widget.Box({
		class_name:'powermenu',
		children: commands.map((item) => {
			return Widget.Button({
				class_name: `power-${item.name}`,
				child: Widget.Label({ label: item.icon }),
				onPrimaryClick: () => {
					return Utils.execAsync(item.command);
				},
			});
		}),
	});
};

function SysTray() {
	const items = systemtray.bind("items").as((items) =>
		items.map((item) =>
			Widget.Button({
				child: Widget.Icon({ icon: item.bind("icon") }),
				on_secondary_click: (_, event) => item.activate(event),
				on_primary_click: (_, event) => item.openMenu(event),
				tooltip_markup: item.bind("tooltip_markup"),
			})
		)
	);

	return Widget.Box({
		class_name: "systray",
		children: items,
	});
}

// layout of the bar
function Left() {
	return Widget.Box({
		spacing: 8,
		children: [Workspaces(), ClientTitle()],
	});
}

function Center() {
	return Widget.Box({
		spacing: 8,
		children: [RamUsage(), CpuUsage()],
	});
}

function Right() {
	return Widget.Box({
		hpack: "end",
		spacing: 8,
		children: [
			// RightClickMenu(),
			Volume(),
			SBrightness(),
			PowerOptions(),
			// BatteryLabel(),
			// Clock(),
			SysTray(),
		],
	});
}

function Bar(monitor = 0) {
	return Widget.Window({
		name: `bar-${monitor}`, // name has to be unique
		class_name: "bar",
		monitor,
		anchor: ["top", "left", "right"],
		exclusivity: "exclusive",
		child: Widget.CenterBox({
			class_name: "bar_box",
			start_widget: Left(),
			center_widget: Center(),
			end_widget: Right(),
		}),
	});
}

const scss = `${App.configDir}/style.scss`;
const css = `/tmp/my-style.css`;
Utils.exec(`sassc ${scss} ${css}`);
Utils.monitorFile(
	// directory that contains the scss files
	`${App.configDir}`,

	// reload function
	function () {
		// main scss file
		const scss = `${App.configDir}/style.scss`;

		// target css file
		const css = `/tmp/my-style.css`;

		// compile, reset, apply
		Utils.exec(`sassc ${scss} ${css}`);
		App.resetCss();
		App.applyCss(css);
	}
);

App.config({
	style: css,
	windows: [
		Bar(),

		// you can call it, for each monitor
		// Bar(0),
		// Bar(1)
	],
});

export {};
