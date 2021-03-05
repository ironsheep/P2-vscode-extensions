# Semantic parsing of Spin2

Accumulation of notes as I'm determing how this should work

## Comments

There are four forms of comments.

**Sample Code:**

```spin
' comment - single line
'' doc comment - single line

{
comment block
}

{{
    doc comment block
}}
```

## Strings

**Sample Code:**

```spin
 "string"
 'string'
```

Regarding methods or functions: we're using methods as spin objects are just that, objects.

## SECTION: CON

This section contains global constant declarations.

Returns from this section: `variable.readonly.definition`, `operator`, `number`, `variable.readonly`

## SECTION: VAR

This section contains global variable declarations.
This is also instance-data, instance variables: `property.declaration`, `type`.

## SECTION: DAT

This section contains data declarations as possibly pasm code.
This is also class-data, class variables: `property.declaration.static`, `type`.

## SECTION: PUB

This section declares a class public method: `method.declaration`.

## SECTION: PRI

This section declares a class private method: `method.declaration.static`.

## SECTION: OBJ

This section effectively imports other classes and names their instances.
Instances can be an array of class instances.

Returns from this section: `variable.class`, `operator`, `number`, `string`, `variable.readonly`

## Examples

This is a collection of notable examples with each predicting what will be emitted by the semantic parser.

### Example: Section Names (CON, DAT, OBJ, VAR)

**Sample Code:**

```spin
CON { Timing }
```

... returns:

- `keyword` start(1,1), end(1,3)
- `comment` start(1,5), end(1,14)

### Example: Comments

**Sample Code:**

```spin
' header comment
```

... returns:

- `comment` start(1,1), end(1,16)

**Sample Code:**

```spin
'' header doc comment
```

... returns:

- `comment.document` start(1,1), end(1,17)

**Sample Code:**

```spin
{
     block comment
}
```

... returns:

- `comment` start(1,1), end(3,1)

**Sample Code:**

```spin
{{
    block doc comments
}}
```

... returns:

- `comment.document` start(1,1), end(3,1)

### Example: CON

This section defines constants. They can be defined literally.

**Sample Code:**

```spin
    DIGIT_NOVALUE = -2   ' digit value when NOT [0-9]
```

... returns:

| text                   | type                            | start       | end       |
| ---------------------- | ------------------------------- | ----------- | --------- |
| DIGIT_NOVALUE          | `variable.readonly.declaration` | start(1,5)  | end(1,18) |
| =                      | `operator`                      | start(1,20) | end(1,20) |
| -2                     | `number`                        | start(1,22) | end(1,23) |
| ' digit value when ... | `comment`                       | start(1,27) | end(1,54) |

They can be defined based on earlier constants in the section.

**Sample Code:**

```spin
    FIVE_K = FIVE_THOUSAND   ' alias this constant
```

... returns:

| text             | type                            | start       | end       |
| ---------------- | ------------------------------- | ----------- | --------- |
| FIVE_K           | `variable.readonly.declaration` | start(1,5)  | end(1,10) |
| =                | `operator`                      | start(1,12) | end(1,12) |
| FIVE_THOUSAND    | `variable.readonly`             | start(1,14) | end(1,26) |
| ' alias this ... | `comment`                       | start(1,30) | end(1,50) |

They can be defined based on constants in other objects, too!

**Sample Code:**

```spin
    DIGIT_NOVALUE = user.DIGIT_NOVALUE   ' expose constant defined in our 'user' object
```

... returns:

| text               | type                            | start       | end         |
| ------------------ | ------------------------------- | ----------- | ----------- | --------- |
| DIGIT_NOVALUE      | `variable.readonly.declaration` | start(1,5)  | end(1,18)   |
| =                  | `operator`                      | start(1,20) | end(1,20)   |
| user               | `class                          | namespace`  | start(1,22) | end(1,23) |
| .                  | `operator`                      | start(1,22) | end(1,23)   |
| DIGIT_NOVALUE      | `variable.readonly`             | start(1,22) | end(1,23)   |
| ' expose consta... | `comment`                       | start(1,27) | end(1,54)   |

**NOTE** Should `class` really be `namespace` ???

### Example: PUB, PRI

Typical "this is not an object" first public method in a file.

**Sample Code:**

```spin
PUB null()
```

... returns:

| text | type                 | start       | end       |
| ---- | -------------------- | ----------- | --------- |
| PUB  | `keyword`            | start(1,1)  | end(1,3)  |
| null | `method.declaration` | start(1,5)  | end(1,8)  |
| \(   | `operator`           | start(1,9)  | end(1,9)  |
| \)   | `operator`           | start(1,10) | end(1,10) |

Typical private method with a single return value and local variables:

**Sample Code:**

```spin
PRI validateBmpFile(pBmpFileImage) : bValidStatus, lengthInBytes | pFileHeader, i, iStart, iEnd, pLastByte  ' notes
```

... returns:

| text            | type                                 | start        | end        |
| --------------- | ------------------------------------ | ------------ | ---------- |
| PRI             | `keyword`                            | start(1,1)   | end(1,3)   |
| validateBmpFile | `method.declaration.static`          | start(1,5)   | end(1,19)  |
| \(              | `operator`                           | start(1,20)  | end(1,20)  |
| pBmpFileImage   | `parameter.declaration.readonly`     | start(1,21)  | end(1,33)  |
| \)              | `operator`                           | start(1,34)  | end(1,34)  |
| :               | `operator`                           | start(1,36)  | end(1,36)  |
| bValidStatus    | `parameter.declaration.local.return` | start(1,38)  | end(1,49)  |
| ,               | `operator`                           | start(1,50)  | end(1,50)  |
| lengthInBytes   | `parameter.declaration.local.return` | start(1,52)  | end(1,64)  |
| \|              | `operator`                           | start(1,66)  | end(1,6)   |
| pFileHeader     | `variable.declaration.local`         | start(1,68)  | end(1,78)  |
| ,               | `operator`                           | start(1,79)  | end(1,79)  |
| i               | `variable.declaration.local`         | start(1,81)  | end(1,81)  |
| ,               | `operator`                           | start(1,82)  | end(1,82)  |
| iStart          | `variable.declaration.local`         | start(1,84)  | end(1,89)  |
| ,               | `operator`                           | start(1,90)  | end(1,90)  |
| iEnd            | `variable.declaration.local`         | start(1,92)  | end(1,95)  |
| ,               | `operator`                           | start(1,96)  | end(1,96)  |
| pLastByte       | `variable.declaration.local`         | start(1,98)  | end(1,106) |
| ' notes         | `comment`                            | start(1,109) | end(1,116) |

### Example: OBJ

This section imports objects to be used.

**Sample Code:**

```spin
    pixels              : "isp_hub75_screenUtils"
```

... returns:

| text                    | type       | start                  | end        |
| ----------------------- | ---------- | ---------------------- | ---------- | --------- |
| pixels                  | `class     | namespace.declaration` | start(1,5) | end(1,10) |
| :                       | `operator` | start(1,25)            | end(1,25)  |
| "isp_hub75_screenUtils" | `string`   | start(1,27)            | end(1,49)  |

**NOTE** Should `class` really be `namespace` ???

**Sample Code:**

```spin
    digit[MAX_DIGITS]   : "isp_hub75_7seg"
```

... returns:

| text                    | type                | start                  | end        |
| ----------------------- | ------------------- | ---------------------- | ---------- | -------- |
| digit                   | `class              | namespace.declaration` | start(1,5) | end(1,9) |
| [                       | `operator`          | start(1,10)            | end(1,10)  |
| MAX_DIGITS              | `variable.readonly` | start(1,11)            | end(1,20)  |
| ]                       | `operator`          | start(1,21)            | end(1,21)  |
| :                       | `operator`          | start(1,25)            | end(1,25)  |
| "isp_hub75_screenUtils" | `string`            | start(1,27)            | end(1,42)  |

**NOTE** Should `class` really be `namespace` ???
