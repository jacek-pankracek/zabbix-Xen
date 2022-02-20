var XAPI ={
    address : "",
    user : "",
    password : "",

    login: function () {
        XAPI.session = {};
        var resp, rpcReturn = {};
        var req = new HttpRequest();

        var data_json = {
            "methodCall": {
                "methodName": "session.login_with_password",
                "params": {
                    "param": [ 
                        {"value": { "string": XAPI.user}},
                        {"value": {	"string": XAPI.password}},
                        {"value": {	"string": "'1.0"}},
                        {"value": {	"string": "zabbix-integration"}}
                    ]
                }
            }
        };
        
        console.warn("[XAPI integration] inside Login");

        req.addHeader('Content-Type: text/xml');
        resp = JSON.parse(XML.toJson(req.post("https://" + XAPI.address, XML.fromJson(JSON.stringify(data_json)))));
        resp.methodResponse.params.param.value.struct.member.forEach(function (member) {
            console.warn("[XAPI integration] member \n" + member.name + "\n" + member.value);
            if (member.name == "Status") {
                rpcReturn.status = member.value;
            } else if (member.name == "Value") {
                XAPI.session = member.value;
            }
        });
        return rpcReturn;
    },

    makeCall: function(methodName){
        var params = [ {"value": { "string": XAPI.session}} ];
        var req = new HttpRequest();
        var rpcReturn = {};

        console.warn("[XAPI integration] inside makeCall");

        for (var i=1; i<arguments.length; i++){
            params.push({"value": { "string": arguments[i]}})
            console.warn(JSON.stringify(params));
        };
        var data_json = {
            "methodCall": {
                "methodName": methodName,
                "params": { "param": params }
            }
        };

        req.addHeader('Content-Type: text/xml');
        resp = JSON.parse(XML.toJson(req.post("https://" + XAPI.address, XML.fromJson(JSON.stringify(data_json)))));
        resp.methodResponse.params.param.value.struct.member.forEach(function (member) {
            console.warn("[XAPI integration] member \n" + member.name + "\n" + member.value);
            if (member.name == "Status") {
                rpcReturn.status = member.value;
            }
        });
        if (rpcReturn.status == "Success"){  
            resp.methodResponse.params.param.value.struct.member.forEach(function (member) {    
                if (member.name == "Value") {
                    try{
                        if (typeof(member.value) === "object" ){
                            if (typeof member.value.boolean != 'undefined'){
                                if (member.value.boolean == "1") { rpcReturn.value = true; }
                                else { rpcReturn.value = false; }
                            }
                            if (typeof member.value.array.data  != 'undefined'){
                                rpcReturn.value = member.value.array.data.value;
                            }
                        }
                        if (typeof(member.value) === "string" ){
                            rpcReturn.value = member.value ;
                        }
                    }
                    catch (error) {
                        console.warn("[XAPI integration] makeCall " + error);
                        console.warn("[XAPI integration] makeCall " + JSON.stringify(member.value));
                    }
                }
            });
        }
        if (rpcReturn.status){
            return rpcReturn.value;
        } else {
            return "Failure";
        }

    }
};


function vmDiscovery() {
    var guests = [];  
    var hostRef = XAPI.makeCall("VM.get_all");
    hostRef.forEach(function (ref) {
        var vm = {};
        if (!XAPI.makeCall("VM.get_is_a_template",ref)){
            if (!XAPI.makeCall("VM.get_is_a_snapshot",ref)){
                vm = {  '{#VMNAME}' : XAPI.makeCall("VM.get_name_label",ref),
                        '{#VMUUID}' : XAPI.makeCall("VM.get_uuid",ref) };
                (guests.push(vm));
            };
        }
    });
    return guests;
};

var params = JSON.parse(value)

console.warn(JSON.stringify(params));


// run script with param action = vmdiscovery

XAPI.address = params.host; // TODO make a setAddress method with http/https trimm
XAPI.user = params.user; // TODO make a setCredentials method
XAPI.password = params.password;

if (XAPI.login().status == "Success"){
    if (params.action == "vmdiscovery") {return (JSON.stringify(vmDiscovery())); }
    else { return false };
} else { return false};



