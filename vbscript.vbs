<%@ Language=VBScript %>
<%
Response.Expires = 0
Response.Buffer = True
Server.ScriptTimeout = 600

'=============================================================

filePath = "C:\inetpub\wwwroot\export_data\sys-codes.json"

WebsiteID = "1390"


'=============================================================
' DB Connection
'=============================================================
Dim conn, rs, strSQL, json, fso, filePath, fileObj

Set conn = Server.CreateObject("ADODB.Connection")
conn.Open Session("MyConnectStr")

'=============================================================
' Query sys_codes
'=============================================================

strSQL = "SELECT top 10 code_id, application_id, code_level, code_type, " & _
         "code_name, order_sequence, active, created_by, creation_date, " & _
         "last_updated_by, last_update_date FROM sys_codes where website_id = " & WebsiteID & " ORDER BY last_update_date desc"

Set rs = conn.Execute(strSQL)

RecordCount = 0

'=============================================================
' Convert to JSON
'=============================================================
json = "["
Do Until rs.EOF
    RecordCount = RecordCount + 1
    json = json & "{"
    json = json & """code_id"":" & NullToJSON(rs("code_id")) & ","
    json = json & """application_id"":" & NullToJSON(rs("application_id")) & ","
    json = json & """code_level"":" & QuoteJSON(rs("code_level")) & ","
    json = json & """code_type"":" & QuoteJSON(rs("code_type")) & ","
    json = json & """code_name"":" & QuoteJSON(rs("code_name")) & ","
    json = json & """order_sequence"":" & NullToJSON(rs("order_sequence")) & ","
    json = json & """active"":" & QuoteJSON(rs("active")) & ","
    json = json & """created_by"":" & NullToJSON(rs("created_by")) & ","
    json = json & """creation_date"":" & DateToUnix(rs("creation_date")) & ","
    json = json & """last_updated_by"":" & NullToJSON(rs("last_updated_by")) & ","
    json = json & """last_update_date"":" & DateToUnix(rs("last_update_date"))
    json = json & "}"
    rs.MoveNext
    If Not rs.EOF Then json = json & ","
Loop
json = json & "]"

rs.Close
Set rs = Nothing
conn.Close
Set conn = Nothing

'=============================================================
' Save to File (UTF-8 without BOM)
'=============================================================

Set fso = CreateObject("ADODB.Stream")
fso.Type = 2 ' text
fso.Charset = "UTF-8"
fso.Open
fso.WriteText json

' Create a new stream to write without BOM
Dim fso2
Set fso2 = CreateObject("ADODB.Stream")
fso2.Type = 1 ' binary
fso2.Open

' Copy the UTF-8 content but skip the BOM (first 3 bytes)
fso.Position = 0
fso.Type = 1 ' binary
fso.Position = 3 ' Skip BOM (EF BB BF)
fso.CopyTo fso2

' Save without BOM
fso2.SaveToFile filePath, 2 ' 2 = overwrite
fso2.Close
Set fso2 = Nothing

fso.Close
Set fso = Nothing

Response.Write "Exported " & CStr(RecordCount) & " records to: " & filePath

'=============================================================
' Helper Functions
'=============================================================
Function QuoteJSON(val)
    If IsNull(val) Or IsEmpty(val) Then
        QuoteJSON = "null"
    Else
        val = CStr(val)
        val = Replace(val, "\", "\\")
        val = Replace(val, """", "\""")
        val = Replace(val, vbCrLf, "\n")
        val = Replace(val, vbCr, "\n")
        val = Replace(val, vbLf, "\n")
        QuoteJSON = """" & val & """"
    End If
End Function

Function NullToJSON(val)
    If IsNull(val) Or IsEmpty(val) Then
        NullToJSON = "null"
    Else
        NullToJSON = CStr(val)
    End If
End Function

Function DateToUnix(val)
    If IsNull(val) Or IsEmpty(val) Then
        DateToUnix = "null"
    Else
        Dim epoch
        epoch = DateSerial(1970,1,1)
        DateToUnix = CLng((CDbl(CDate(val)) - CDbl(epoch)) * 86400)
    End If
End Function
%>



