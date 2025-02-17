# FlowForge Cloud

FlowForge Cloud is a hosted service allowing users to sign-up and start creating teams and projects without having to install and manage their own instance of FlowForge.
The [Concepts](../user/concepts.md) remain the same, however FlowForge Inc. is the administrator of the platform.

## Billing
Customers are billed at the team level for each project they create. This is a recurring monthly charge.
See the [Billing](./billing.md) page for more detailed answers about billing.

## Support
Customers can get support by emailing support@flowforge.com, we presently only offer support for the flowforge application and your account, any issues relating to Node-RED such as your flows or a 3rd party node should be raised in the appropriate community forum, for example https://discourse.nodered.org/ or the GitHub project of the third party node.

## File System
The file system within a project is not persistent, therefore users should avoid writing anything to this. The Node-RED Nodes for file in and out have been removed. Other 3rd party nodes _may_ attempt to access the filesystem with unpredictable results.

## Network Connections
### HTTP(S) & Websockets
Projects expose an HTTPS interface on port 443 with each project having its own hostname (example.flowforge.cloud), Plain HTTP requests to port 80 will receive a redirect to HTTPS on port 443.
You MUST connect using the hostname not the IP address to reach your project.
Websocket connections over SSL (wss:) are also supported.

### TCP and UDP
Incoming TCP or UDP connections will not work, the TCP and UDP Nodes have therefore been removed

### MQTT
MQTT Connections to an external broker using the standard MQTT nodes will work fine as the connection is initiated by Node-RED.

### IP Addresses
Outbound connections from FlowForge will always come from the IP address `63.33.85.112`. 
This can make access to a remote database or corporate network possible where those systems are protected by IP address filtering firewalls. As mentioned in HTTP above, incoming connections MUST be to the hostname not the IP address.
