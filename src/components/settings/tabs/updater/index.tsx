/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useSettings } from "@api/Settings";
import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings";
import { Margins } from "@utils/margins";
import { identity } from "@utils/misc";
import { useAwaiter } from "@utils/react";
import { getRepo, isNewer, UpdateLogger } from "@utils/updater";
import { React, Select } from "@webpack/common";

import gitBranch from "~git-branch";
import gitHash from "~git-hash";

import { HashLink, Newer, Updatable } from "./Components";

export function BranchSelector() {
    const settings = useSettings(["enableBranchSwapping", "selectedBranch"]);

    if (!settings.enableBranchSwapping) return null;

    return (
        <>
            <Heading className={Margins.top20}>Branch</Heading>
            <Paragraph className={Margins.bottom8}>
                Select which release branch to use for updates.
            </Paragraph>
            <Select
                className={Margins.bottom20}
                placeholder="Select branch"
                options={[
                    { label: "Stable", value: "stable", default: true },
                    { label: "Dev", value: "dev" }
                ]}
                select={v => settings.selectedBranch = v}
                isSelected={v => settings.selectedBranch === v}
                serialize={identity}
            />
            <Divider />
        </>
    );
}

interface CommonProps {
    repo: string;
    repoPending: boolean;
}

function Updater() {
    const settings = useSettings(["autoUpdate", "autoUpdateNotification", "enableBranchSwapping", "selectedBranch"]);

    const [repo, err, repoPending] = useAwaiter(getRepo, { fallbackValue: "Loading..." });

    React.useEffect(() => {
        if (err)
            UpdateLogger.error("Failed to retrieve repo", err);
    }, [err]);

    const commonProps: CommonProps = {
        repo,
        repoPending
    };

    const branchDisplay = settings.selectedBranch === "dev" ? "Dev" : "Stable";

    return (
        <SettingsTab>
            <Heading className={Margins.top16}>Update Preferences</Heading>
            <Paragraph className={Margins.bottom20}>
                Control how Equicord keeps itself up to date. You can choose to update automatically in the background or be notified when new updates are available.
            </Paragraph>

            <FormSwitch
                title="Automatically update"
                description="When enabled, Equicord will automatically download and install updates in the background without asking for confirmation. You'll need to restart Discord to apply the changes."
                value={settings.autoUpdate}
                onChange={(v: boolean) => settings.autoUpdate = v}
                hideBorder
            />
            <FormSwitch
                value={settings.autoUpdateNotification}
                onChange={(v: boolean) => settings.autoUpdateNotification = v}
                title="Get notified when an automatic update completes"
                description="Receive a notification when Equicord finishes downloading an update in the background, so you know when to restart Discord."
                disabled={!settings.autoUpdate}
                hideBorder
            />

            <Divider className={Margins.top20} />

            <BranchSelector />

            <Heading className={Margins.top20}>Repository</Heading>
            <Paragraph className={Margins.bottom8}>
                This is the GitHub repository where Equicord fetches updates from.
            </Paragraph>
            <Paragraph color="text-subtle">
                {repoPending
                    ? repo
                    : err
                        ? "Failed to retrieve - check console"
                        : (
                            <Link href={repo}>
                                {repo.split("/").slice(-2).join("/")}
                            </Link>
                        )
                }
                {" "}(<HashLink hash={gitHash} repo={repo} disabled={repoPending} />)
                {` • Build: ${gitBranch.charAt(0).toUpperCase() + gitBranch.slice(1)}`}
                {settings.enableBranchSwapping && ` • Selected: ${branchDisplay}`}
            </Paragraph>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>Updates</Heading>
            {isNewer ? <Newer {...commonProps} /> : <Updatable {...commonProps} />}
        </SettingsTab>
    );
}

export default IS_UPDATER_DISABLED
    ? null
    : wrapTab(Updater, "Updater");
