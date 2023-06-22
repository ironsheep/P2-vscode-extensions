'' latest findings needing to be fixed

' --------------------------------------------------------------------------------------------------
' REF: https://github.com/ironsheep/P2-vscode-extensions/issues/17
CON

#0, P_HIGH_FLOAT, P_HIGH_1K5, P_HIGH_1MA, P_HIGH_15K    ' (not really legit in P1 code) so fake it

OBJ

    serIO : "jm_serial"         ' jm  serial object
    serIO[3] : "jm_serial"         ' jm  serial object

pub main : ok

PRI pullUpValueForEnum(pullupRqst) : pullup
  case pullupRqst
    serIO.PU_NONE : pullup := P_HIGH_FLOAT                            ' use external pull-up
    serIO.PU_1K5  : pullup := P_HIGH_1K5                              ' 1.5k
    serIO.PU_3K3  : pullup := P_HIGH_1MA                              ' acts like ~3.3k
    other   : pullup := P_HIGH_15K                              ' 15K

' --------------------------------------------------------------------------------------------------
' REF: https://github.com/ironsheep/P2-vscode-extensions/issues/18
    if pullupRqst == serIO.PU_NONE
      pullup := P_HIGH_FLOAT
    elseif pullupRqst == serIO.PU_1K5
      pullup := P_HIGH_1K5
    else if pullupRqst == serIO.PU_3K3   ' this ELSE IF won't compile!!  BAD Mark as RED
      pullup := P_HIGH_1MA
    else
      pullup := P_HIGH_15K
